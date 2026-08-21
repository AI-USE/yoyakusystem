'use server';

import { supabaseAdmin } from '@/lib/supabase';
import { createExperienceRoom, createExperienceGuest, createExperienceGuestDetailed } from '@/lib/experience-api';
import { revalidatePath } from 'next/cache';

// Uniform response type
export type ActionResponse = {
  success: boolean;
  message?: string;
  data?: any;
};

// Naming helper for JST date and time (e.g., "5月10日 14:00の回")
function formatSlotRoomName(startTimeIso: string): string {
  const jstDate = new Date(new Date(startTimeIso).getTime() + 9 * 60 * 60 * 1000);
  const month = jstDate.getUTCMonth() + 1;
  const day = jstDate.getUTCDate();
  const hours = jstDate.getUTCHours().toString().padStart(2, '0');
  const minutes = jstDate.getUTCMinutes().toString().padStart(2, '0');
  return `${month}月${day}日 ${hours}:${minutes}の回`;
}

export async function createSlot(formData: { start_time: string, end_time: string, capacity: number, publish_at?: string }): Promise<ActionResponse> {
  try {
    // 1. Insert slot without pre-creating room (Room will be created lazily on first check-in)
    const nowIso = new Date().toISOString();
    const { error } = await supabaseAdmin.from('slots').insert({
        ...formData,
        publish_at: formData.publish_at || nowIso,
        room_id: null
    });

    if (error) return { success: false, message: `枠の作成に失敗しました: ${error.message}` };
    
    revalidatePath('/slots');
    return { success: true, message: '枠を作成しました' };
  } catch (err: any) {
    return { success: false, message: `システムエラー: ${err.message}` };
  }
}

export async function deleteSlot(id: string): Promise<ActionResponse> {
  const { error } = await supabaseAdmin.from('slots').delete().eq('id', id);
  if (error) return { success: false, message: `枠の削除に失敗しました: ${error.message}` };
  revalidatePath('/slots');
  return { success: true, message: '枠を削除しました' };
}

async function issueExperienceUrl(userName: string, roomId: string | null, slotId: string): Promise<{ success: boolean; url: string | null; error?: string }> {
  let activeRoomId = roomId;

  // 万が一/初回チェックイン時に部屋が未作成(room_idがNULL)の場合、オンデマンドで1回のみ部屋を作成しDBに保存・再利用
  if (!activeRoomId) {
    try {
      const { data: slot } = await supabaseAdmin.from('slots').select('start_time').eq('id', slotId).single();
      if (slot) {
        const roomName = formatSlotRoomName(slot.start_time);
        const newRoomId = await createExperienceRoom(roomName);
        if (newRoomId) {
          activeRoomId = newRoomId;
          await supabaseAdmin.from('slots').update({ room_id: newRoomId }).eq('id', slotId);
        }
      }
    } catch (roomErr: any) {
      return { success: false, url: null, error: `体験用ルームの作成に失敗しました: ${roomErr.message}` };
    }
  }

  if (!activeRoomId) {
    return { success: false, url: null, error: '体験システム上に有効なルーム(roomId)が見つかりません。' };
  }

  const result = await createExperienceGuestDetailed(userName, activeRoomId);
  if (!result.success || !result.data?.guestUrl) {
    return { success: false, url: null, error: result.errorDetails || '体験用URLの発行に失敗しました' };
  }
  return { success: true, url: result.data.guestUrl };
}

export async function checkInReservation(idOrToken: string, expectedSlotId?: string): Promise<ActionResponse> {
  try {
    const query = supabaseAdmin.from('reservations').select('id, status, slot_id, user_name, line_user_id, slots(id, start_time, room_id)');
    
    const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(idOrToken);
    if (!isUUID) return { success: false, message: '無効な形式のコードです' };

    const { data: current, error: fetchError } = await query
        .or(`id.eq.${idOrToken},qr_code_token.eq.${idOrToken}`)
        .maybeSingle();
    
    if (fetchError || !current) return { success: false, message: '予約データが見つかりません' };
    if (current.status === 'checked_in') return { success: false, message: '既に受付済みです' };

    const slot = Array.isArray(current.slots) ? current.slots[0] : current.slots;
    
    if (expectedSlotId && current.slot_id !== expectedSlotId) {
        const slotTime = new Date(slot.start_time).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
        return { success: false, message: `枠が異なります（予約: ${slotTime}の回）` };
    }

    let experienceUrl: string | null = null;
    let urlWarning = '';
    const urlResult = await issueExperienceUrl(current.user_name || 'ゲスト', slot.room_id, current.slot_id);

    if (!urlResult.success || !urlResult.url) {
        urlWarning = ` (※体験URL発行失敗: ${urlResult.error || '不明なエラー'})`;
    } else {
        experienceUrl = urlResult.url;
    }
    
    const { error } = await supabaseAdmin
        .from('reservations')
        .update({ 
          status: 'checked_in', 
          experience_url: experienceUrl,
          updated_at: new Date().toISOString() 
        })
        .eq('id', current.id);
        
    if (error) return { success: false, message: `入場処理に失敗しました: ${error.message}` };
    
    revalidatePath('/reception');
    revalidatePath('/settings');
    return {
      success: true,
      message: `入場を受け付けました${urlWarning}`,
      data: { experienceUrl }
    };
  } catch (err: any) {
    return { success: false, message: `システムエラー: ${err.message}` };
  }
}

export async function finalizeReservation(slotId: string, userName: string, lineUserId: string | null, status: 'reserved' | 'checked_in' = 'reserved'): Promise<ActionResponse> {
    try {
        const { data, error } = await supabaseAdmin.rpc('reserve_slot', {
            p_slot_id: slotId,
            p_line_user_id: lineUserId,
            p_user_name: userName
        });

        if (error) return { success: false, message: `DBエラー: ${error.message}` };
        if (!data.success) return { success: false, message: data.message };

        const reservationId = data.id;

        let warning = '';
        if (status === 'checked_in') {
            const { data: slot } = await supabaseAdmin.from('slots').select('id, room_id, start_time').eq('id', slotId).single();
            
            let experienceUrl: string | null = null;
            const urlResult = await issueExperienceUrl(userName, slot?.room_id || null, slotId);
            if (!urlResult.success || !urlResult.url) {
                warning = ` (※体験URL発行失敗: ${urlResult.error || '不明なエラー'})`;
            } else {
                experienceUrl = urlResult.url;
            }
            
            await supabaseAdmin.from('reservations').update({ 
                status: 'checked_in', 
                experience_url: experienceUrl 
            }).eq('id', reservationId);
        }

        revalidatePath('/reception');
        revalidatePath('/settings');
        revalidatePath('/slots');
        return {
          success: true,
          message: status === 'checked_in' ? `受付と入場を完了しました${warning}` : '予約を確定しました'
        };
    } catch (err: any) {
        return { success: false, message: `システムエラー: ${err.message}` };
    }
}

export async function slideSlots(mins: number, mode: 'single' | 'cascade' = 'cascade', targetSlotId?: string): Promise<ActionResponse> {
    try {
        let slotsToUpdate = [];
        
        if (targetSlotId) {
            const { data: target, error: targetError } = await supabaseAdmin.from('slots').select('id, start_time, end_time').eq('id', targetSlotId).single();
            if (targetError || !target) return { success: false, message: '対象の枠が見つかりません' };
            slotsToUpdate = [target];
            
            if (mode === 'cascade') {
                const { data: following } = await supabaseAdmin
                    .from('slots')
                    .select('id, start_time, end_time')
                    .gt('start_time', target.start_time)
                    .order('start_time', { ascending: true });
                if (following) slotsToUpdate = [...slotsToUpdate, ...following];
            }
        } else {
            const now = new Date().toISOString();
            const { data: upcoming, error: upcomingError } = await supabaseAdmin
                .from('slots')
                .select('id, start_time, end_time')
                .gt('start_time', now)
                .order('start_time', { ascending: true });
            if (upcomingError) return { success: false, message: '枠の取得に失敗しました' };
            slotsToUpdate = upcoming || [];
        }

        if (slotsToUpdate.length === 0) return { success: false, message: 'スライド対象の枠がありません' };

        const updates = slotsToUpdate.map(slot => {
            const newStart = new Date(new Date(slot.start_time).getTime() + mins * 60000).toISOString();
            const newEnd = new Date(new Date(slot.end_time).getTime() + mins * 60000).toISOString();
            return supabaseAdmin.from('slots').update({ start_time: newStart, end_time: newEnd }).eq('id', slot.id);
        });
        
        await Promise.all(updates);
        revalidatePath('/slots');
        return { success: true, message: `${slotsToUpdate.length}件の枠を${mins}分スライドしました` };
    } catch (err: any) {
        return { success: false, message: `エラー: ${err.message}` };
    }
}

export async function toggleSlotCancel(id: string, isCancelled: boolean): Promise<ActionResponse> {
    const { error } = await supabaseAdmin.from('slots').update({ is_cancelled: !isCancelled }).eq('id', id);
    if (error) return { success: false, message: `ステータス変更に失敗しました: ${error.message}` };
    revalidatePath('/operations');
    return { success: true, message: isCancelled ? '運用を再開しました' : '枠を中止しました' };
}

export async function createNotification(message: string, slotId: string | null, isUrgent: boolean): Promise<ActionResponse> {
    const { error } = await supabaseAdmin.from('notifications').insert({ message, slot_id: slotId, is_urgent: isUrgent });
    if (error) return { success: false, message: `通知の配信に失敗しました: ${error.message}` };
    revalidatePath('/notifications');
    return { success: true, message: '通知を配信しました' };
}

export async function addToBlacklist(lineUserId: string, reason: string): Promise<ActionResponse> {
    const { error } = await supabaseAdmin.from('blacklist').insert({ line_user_id: lineUserId, reason });
    if (error) return { success: false, message: `追加に失敗しました。既に登録されている可能性があります。` };
    revalidatePath('/blacklist');
    return { success: true, message: 'ブラックリストに追加しました' };
}

export async function removeFromBlacklist(lineUserId: string): Promise<ActionResponse> {
    const { error } = await supabaseAdmin.from('blacklist').delete().eq('line_user_id', lineUserId);
    if (error) return { success: false, message: `削除に失敗しました: ${error.message}` };
    revalidatePath('/blacklist');
    return { success: true, message: '解除しました' };
}

export async function updateReservationStatus(id: string, status: string): Promise<ActionResponse> {
    const { error } = await supabaseAdmin.from('reservations').update({ status }).eq('id', id);
    if (error) return { success: false, message: `ステータス変更に失敗しました: ${error.message}` };
    revalidatePath('/reception');
    revalidatePath('/slots');
    revalidatePath('/settings');
    return { success: true, message: 'ステータスを変更しました' };
}

export async function reassignReservation(reservationId: string, newSlotId: string): Promise<ActionResponse> {
    const { data: slot, error: slotErr } = await supabaseAdmin.from('slots').select('capacity, reservations(status)').eq('id', newSlotId).single();
    if (slotErr || !slot) return { success: false, message: '移動先の枠が見つかりません' };

    const reservedCount = slot.reservations.filter((r: any) => r.status !== 'cancelled').length;
    if (reservedCount >= slot.capacity) return { success: false, message: '移動先の枠が満員です' };

    const { error } = await supabaseAdmin.from('reservations').update({ slot_id: newSlotId }).eq('id', reservationId);
    if (error) return { success: false, message: `移動に失敗しました: ${error.message}` };
    
    revalidatePath('/slots');
    return { success: true, message: '予約枠を変更しました' };
}

export async function deleteNotification(id: string): Promise<ActionResponse> {
    const { error } = await supabaseAdmin.from('notifications').delete().eq('id', id);
    if (error) return { success: false, message: `削除に失敗しました: ${error.message}` };
    revalidatePath('/notifications');
    return { success: true, message: '通知を削除しました' };
}

// 招待URL発行
export async function createInvitation(slotId: string, durationMinutes: number = 30): Promise<ActionResponse> {
    try {
        const expiresAt = new Date(Date.now() + durationMinutes * 60000).toISOString();
        const { data, error } = await supabaseAdmin
            .from('invitations')
            .insert({ slot_id: slotId, expires_at: expiresAt })
            .select('token, expires_at')
            .single();

        if (error) return { success: false, message: `招待リンク作成失敗: ${error.message}` };

        const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://liff.line.me/YOUR_LIFF_ID';
        const inviteUrl = `${baseUrl}?invite=${data.token}`;

        return {
            success: true,
            message: '招待リンクを発行しました',
            data: { inviteUrl, token: data.token, expiresAt: data.expires_at }
        };
    } catch (err: any) {
        return { success: false, message: `システムエラー: ${err.message}` };
    }
}

// 招待URLの取り消し・削除
export async function deleteInvitation(id: string): Promise<ActionResponse> {
    try {
        const { error } = await supabaseAdmin.from('invitations').delete().eq('id', id);
        if (error) return { success: false, message: `招待リンクの削除に失敗しました: ${error.message}` };
        revalidatePath('/slots');
        return { success: true, message: '招待リンクを取り消しました' };
    } catch (err: any) {
        return { success: false, message: `エラー: ${err.message}` };
    }
}

// 予約枠パターン (JSON) 一括登録
export async function importSlotsPattern(patternJson: string): Promise<ActionResponse> {
    try {
        const slotsArray = JSON.parse(patternJson);
        if (!Array.isArray(slotsArray)) {
            return { success: false, message: 'JSONデータは配列形式である必要があります。' };
        }

        for (const item of slotsArray) {
            if (!item.start_time || !item.end_time || typeof item.capacity !== 'number') {
                return { success: false, message: '各要素に start_time, end_time, capacity が含まれているか確認してください。' };
            }
        }

        const nowIso = new Date().toISOString();
        const inserts = slotsArray.map(item => ({
            start_time: item.start_time,
            end_time: item.end_time,
            capacity: item.capacity,
            publish_at: item.publish_at || nowIso,
            room_id: null
        }));

        const { error } = await supabaseAdmin.from('slots').insert(inserts);
        if (error) return { success: false, message: `一括登録失敗: ${error.message}` };

        revalidatePath('/slots');
        return { success: true, message: `${inserts.length}件の予約枠を正常に登録しました` };
    } catch (err: any) {
        return { success: false, message: `JSON解析/登録エラー: ${err.message}` };
    }
}

// 予約枠オールリセット (要管理者パスワード)
export async function resetAllSlots(password: string): Promise<ActionResponse> {
    try {
        if (password !== process.env.ADMIN_PASSWORD) {
            return { success: false, message: 'パスワードが正しくありません' };
        }

        await supabaseAdmin.from('reservations').delete().neq('id', '00000000-0000-0000-0000-000000000000');
        await supabaseAdmin.from('notifications').delete().neq('id', '00000000-0000-0000-0000-000000000000');
        await supabaseAdmin.from('invitations').delete().neq('id', '00000000-0000-0000-0000-000000000000');
        const { error } = await supabaseAdmin.from('slots').delete().neq('id', '00000000-0000-0000-0000-000000000000');

        if (error) return { success: false, message: `リセット失敗: ${error.message}` };

        revalidatePath('/slots');
        revalidatePath('/reception');
        revalidatePath('/operations');
        return { success: true, message: 'すべての予約枠とデータをリセットしました' };
    } catch (err: any) {
        return { success: false, message: `エラー: ${err.message}` };
    }
}
