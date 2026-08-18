'use server';

import { supabaseAdmin } from '@/lib/supabase';
import { createExperienceRoom, createExperienceGuest } from '@/lib/experience-api';
import { revalidatePath } from 'next/cache';

// Uniform response type
export type ActionResponse = {
  success: boolean;
  message?: string;
  data?: any;
};

export async function createSlot(formData: { start_time: string, end_time: string, capacity: number }): Promise<ActionResponse> {
  try {
    // 1. Create Experience Room first with strict JST formatted time name
    const jstDate = new Date(new Date(formData.start_time).getTime() + 9 * 60 * 60 * 1000);
    const startTimeStr = jstDate.getUTCHours().toString().padStart(2, '0') + ':' + jstDate.getUTCMinutes().toString().padStart(2, '0');
    
    const roomId = await createExperienceRoom(`${startTimeStr}の回`);

    // 2. Insert slot with room_id
    const { error } = await supabaseAdmin.from('slots').insert({
        ...formData,
        room_id: roomId // Store the UUID from the experience API
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

import { createExperienceGuestDetailed } from '@/lib/experience-api';

async function issueExperienceUrl(userName: string, roomId: string | null, slotId: string): Promise<{ success: boolean; url: string | null; error?: string }> {
  let activeRoomId = roomId;

  // 万が一、枠作成時に部屋作成が失敗してroom_idがNULLの場合、入場時に自動で部屋をオンデマンド作成して救済
  if (!activeRoomId) {
    try {
      const { data: slot } = await supabaseAdmin.from('slots').select('start_time').eq('id', slotId).single();
      if (slot) {
        const jstDate = new Date(new Date(slot.start_time).getTime() + 9 * 60 * 60 * 1000);
        const startTimeStr = jstDate.getUTCHours().toString().padStart(2, '0') + ':' + jstDate.getUTCMinutes().toString().padStart(2, '0');
        
        const newRoomId = await createExperienceRoom(`${startTimeStr}の回`);
        if (newRoomId) {
          activeRoomId = newRoomId;
          // DBに保存して次回以降のチェックインでも再利用可能にする
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
    // Both ID and Token are UUID-like in this system, so we check both columns
    const query = supabaseAdmin.from('reservations').select('id, status, slot_id, user_name, line_user_id, slots(id, start_time, room_id)');
    
    // Safety check for UUID format before querying to avoid DB errors
    const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(idOrToken);
    if (!isUUID) return { success: false, message: '無効な形式のコードです' };

    const { data: current, error: fetchError } = await query
        .or(`id.eq.${idOrToken},qr_code_token.eq.${idOrToken}`)
        .maybeSingle();
    
    if (fetchError || !current) return { success: false, message: '予約データが見つかりません' };
    if (current.status === 'checked_in') return { success: false, message: '既に受付済みです' };

    // 枠の一致チェック
    const slot = Array.isArray(current.slots) ? current.slots[0] : current.slots;
    
    if (expectedSlotId && current.slot_id !== expectedSlotId) {
        const slotTime = new Date(slot.start_time).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
        return { success: false, message: `枠が異なります（予約: ${slotTime}の回）` };
    }

    // 体験URLの発行処理（万が一失敗した場合は、エラーメッセージと原因をフロントへ返却して入場をロールバック）
    const urlResult = await issueExperienceUrl(current.user_name || 'ゲスト', slot.room_id, current.slot_id);
    if (!urlResult.success || !urlResult.url) {
        return { success: false, message: urlResult.error || '体験URLの発行に失敗しました' };
    }

    const experienceUrl = urlResult.url;
    
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
    return { success: true, message: '入場を受け付けました', data: { experienceUrl } };
  } catch (err: any) {
    return { success: false, message: `システムエラー: ${err.message}` };
  }
}

export async function finalizeReservation(slotId: string, userName: string, lineUserId: string | null, status: 'reserved' | 'checked_in' = 'reserved'): Promise<ActionResponse> {
    try {
        // Atomic check via RPC (we can reuse reserve_slot or use direct insert with error handling)
        const { data, error } = await supabaseAdmin.rpc('reserve_slot', {
            p_slot_id: slotId,
            p_line_user_id: lineUserId,
            p_user_name: userName
        });

        if (error) return { success: false, message: `DBエラー: ${error.message}` };
        if (!data.success) return { success: false, message: data.message };

        const reservationId = data.id;

        // If status is checked_in, issue URL
        if (status === 'checked_in') {
            // Need roomId from slot
            const { data: slot } = await supabaseAdmin.from('slots').select('id, room_id, start_time').eq('id', slotId).single();
            
            // 体験URLの発行（万が一失敗した場合は、エラーメッセージを投げて予約挿入自体をロールバック/エラー扱いにする）
            const urlResult = await issueExperienceUrl(userName, slot?.room_id || null, slotId);
            if (!urlResult.success || !urlResult.url) {
                return { success: false, message: urlResult.error || '体験用URLの発行に失敗しました' };
            }

            const experienceUrl = urlResult.url;
            
            await supabaseAdmin.from('reservations').update({ 
                status: 'checked_in', 
                experience_url: experienceUrl 
            }).eq('id', reservationId);
        }

        revalidatePath('/reception');
        revalidatePath('/settings');
        revalidatePath('/slots');
        return { success: true, message: status === 'checked_in' ? '受付と入場を完了しました' : '予約を確定しました' };
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
            // Slide all future slots if no target ID
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
    // Check capacity of new slot
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
