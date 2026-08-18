// Initialize Supabase using values from config.js
const supabaseClient = supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_KEY);

let userProfile = null;
let currentReservation = null;

// Initialize Lucide Icons
lucide.createIcons();

async function init() {
    try {
        await liff.init({ liffId: CONFIG.LIFF_ID });
        if (!liff.isLoggedIn()) {
            liff.login();
            return;
        }
        userProfile = await liff.getProfile();
        document.getElementById('user-name').textContent = userProfile.displayName;
        
        await fetchData();

        // Check for invitation token parameter (?invite=TOKEN)
        const urlParams = new URLSearchParams(window.location.search);
        const inviteToken = urlParams.get('invite');
        if (inviteToken) {
            await handleInviteToken(inviteToken);
        }
        
        document.getElementById('loading-screen').classList.add('hidden');
        document.getElementById('main-content').classList.remove('hidden');
        
        setupInteractions();
        startScaryTimer();
    } catch (err) {
        console.error('LIFF Init Error:', err);
        alert('初期化に失敗しました。設定を確認してください。');
    }
}

async function fetchData() {
    if (!userProfile) return;

    // 0. Check Blacklist
    const { data: ban } = await supabaseClient
        .from('blacklist')
        .select('line_user_id')
        .eq('line_user_id', userProfile.userId)
        .maybeSingle();

    if (ban) {
        document.getElementById('banned-view').classList.remove('hidden');
        document.getElementById('reservation-view').classList.add('hidden');
        document.getElementById('slot-selection-view').classList.add('hidden');
        document.getElementById('general-qr-btn-container').classList.add('hidden');
        return;
    }

    // 1. Fetch Slots (Filter for Today, Not started, and using availability view)
    // Filter out unpublished slots (publish_at > NOW())
    const now = dayjs().toISOString();
    const endOfDay = dayjs().endOf('day').toISOString();
    
    const { data: slots } = await supabaseClient
        .from('slot_availability')
        .select('id, start_time, end_time, capacity, reserved_count, publish_at')
        .eq('is_cancelled', false)
        .gt('start_time', now) 
        .lte('start_time', endOfDay)
        .or(`publish_at.is.null,publish_at.lte.${now}`)
        .order('start_time', { ascending: true });

    window.allSlots = slots || [];
    renderSlots(slots || []);

    // 2. Fetch Reservation
    const { data: res } = await supabaseClient
        .from('reservations')
        .select('id, status, reception_number, qr_code_token, experience_url, slot_id, slots(start_time, end_time)')
        .eq('line_user_id', userProfile.userId)
        .not('status', 'eq', 'cancelled')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
    
    currentReservation = res;
    renderReservation(res);

    // 3. Fetch Notifications
    const { data: notes } = await supabaseClient
        .from('notifications')
        .select('message, is_urgent, created_at')
        .or(`slot_id.is.null,slot_id.eq.${res?.slot_id || '00000000-0000-0000-0000-000000000000'}`)
        .order('created_at', { ascending: false })
        .limit(3);
    
    renderNotifications(notes || []);

    // 4. Fetch Global Settings (Finished URL fallback to CONFIG.FINISHED_URL)
    const { data: settings } = await supabaseClient
        .from('global_settings')
        .select('value')
        .eq('key', 'finished_url')
        .maybeSingle();
    window.finishedUrl = settings?.value || CONFIG.FINISHED_URL || 'https://example.com/finished';
}

async function handleInviteToken(token) {
    if (currentReservation) {
        alert('すでに予約済みのため、招待リンクはご利用いただけません。');
        return;
    }

    const { data: inv, error } = await supabaseClient
        .from('invitations')
        .select('id, slot_id, status, expires_at, slots(start_time, end_time)')
        .eq('token', token)
        .maybeSingle();

    if (error || !inv) {
        alert('無効な招待リンクです。');
        return;
    }

    if (inv.status !== 'pending' || dayjs(inv.expires_at).isBefore(dayjs())) {
        alert('この招待リンクは有効期限切れか既に利用されています。');
        return;
    }

    const slot = Array.isArray(inv.slots) ? inv.slots[0] : inv.slots;
    const start = dayjs(slot.start_time).tz("Asia/Tokyo").format('HH:mm');
    const end = dayjs(slot.end_time).tz("Asia/Tokyo").format('HH:mm');

    const modal = document.getElementById('general-qr-modal');
    const qrContainer = document.getElementById('general-qrcode');
    const modalTitle = modal.querySelector('h3');
    const modalDesc = modal.querySelector('p.text-xs');

    qrContainer.innerHTML = `
        <div class="my-4">
            <button id="redeem-invite-btn" class="maid-btn w-full py-4 px-6 text-base font-black shadow-lg active:scale-95 transition-all">
                【${start} 〜 ${end}】<br>この枠で予約を確定する
            </button>
        </div>
    `;

    modalTitle.textContent = '招待限定予約';
    modalDesc.innerHTML = `特別招待枠（確定保留中）です。<br>上のボタンを押して予約を完了させてください。`;
    modal.classList.remove('hidden');

    document.getElementById('redeem-invite-btn').onclick = async () => {
        const { data, error: rpcErr } = await supabaseClient.rpc('redeem_invitation', {
            p_token: token,
            p_line_user_id: userProfile.userId,
            p_user_name: userProfile.displayName
        });

        if (rpcErr || !data.success) {
            alert(data?.message || rpcErr?.message || '予約の完了に失敗しました。');
            return;
        }

        alert('招待予約が完了しました！');
        modal.classList.add('hidden');
        await fetchData();
    };
}

function renderSlots(slots) {
    const container = document.getElementById('slots-container');
    container.innerHTML = '';
    
    // Filter slots to only show those that aren't full (started/today already handled by fetch)
    const availableSlots = slots.filter(slot => {
        const remaining = slot.capacity - (slot.reserved_count || 0);
        return remaining > 0;
    });

    if (availableSlots.length === 0) {
        container.innerHTML = `<div class="glass-card p-12 text-center text-gray-400 font-bold">予約可能な空き枠はありません</div>`;
        return;
    }

    availableSlots.forEach(slot => {
        const remaining = slot.capacity - (slot.reserved_count || 0);
        const isFull = remaining <= 0;
        const start = dayjs(slot.start_time).tz("Asia/Tokyo").format('HH:mm');
        const end = dayjs(slot.end_time).tz("Asia/Tokyo").format('HH:mm');

        const div = document.createElement('div');
        div.className = `w-full glass-card p-6 flex justify-between items-center transition-all ${isFull ? 'opacity-40 grayscale pointer-events-none' : 'active:scale-95'}`;
        div.innerHTML = `
            <div class="text-left">
                <div class="text-2xl font-black text-gray-800 tracking-tight">${start} 〜 ${end}</div>
                <div class="text-[10px] font-bold text-gray-400 uppercase">Capacity: ${slot.capacity}</div>
            </div>
            <div class="text-right">
                <div class="text-xs font-black px-4 py-2 rounded-2xl ${isFull ? 'bg-gray-100 text-gray-400' : 'bg-pink-50 text-pink-500'}">
                    ${isFull ? '満席' : `残 ${remaining} 席`}
                </div>
            </div>
        `;
        if (!isFull) {
            div.onclick = () => handleReserve(slot.id);
        }
        container.appendChild(div);
    });
}

function renderReservation(res) {
    const resView = document.getElementById('reservation-view');
    const slotView = document.getElementById('slot-selection-view');
    const qrBtn = document.getElementById('general-qr-btn-container');

    if (res) {
        resView.classList.remove('hidden');
        slotView.classList.add('hidden');
        qrBtn.classList.add('hidden');

        // Status Badge logic
        const now = dayjs().tz("Asia/Tokyo");
        const start = dayjs(res.slots.start_time).tz("Asia/Tokyo");
        const end = dayjs(res.slots.end_time).tz("Asia/Tokyo");
        
        let statusText = '予約確定';
        if (res.status === 'finished') statusText = '終了';
        else if (res.status === 'checked_in') statusText = now.isAfter(end) ? '終了' : '体験中';
        else if (now.isAfter(end)) statusText = '終了';
        else if (now.isAfter(start)) statusText = '開催中';
        
        document.getElementById('status-badge').textContent = statusText;
        document.getElementById('ticket-number').textContent = `No. ${res.reception_number}`;
        
        const sTime = start.format('HH:mm');
        const eTime = end.format('HH:mm');
        document.getElementById('ticket-time').innerHTML = `<i data-lucide="clock" size="20"></i> <span>${sTime} 〜 ${eTime}</span>`;
        
        // Generate QR
        const qrContainer = document.getElementById('qrcode');
        qrContainer.innerHTML = '';
        const qr = qrcode(0, 'M');
        qr.addData(res.qr_code_token);
        qr.make();
        qrContainer.innerHTML = qr.createImgTag(6);
        
        // Container for Dynamic Buttons
        const prevActions = resView.querySelector('.mt-6');
        if (prevActions) prevActions.remove();
        const actionContainer = document.createElement('div');
        actionContainer.className = 'mt-6 space-y-4';

        if (statusText === '体験中') {
            document.getElementById('cancel-btn').classList.add('hidden');
            document.getElementById('qrcode').classList.add('opacity-20', 'grayscale');
            
            if (res.experience_url) {
                actionContainer.innerHTML = `
                    <a href="${res.experience_url}" target="_blank" class="maid-btn w-full py-5 text-lg font-black flex items-center justify-center shadow-lg active:scale-95 transition-all">
                        <i data-lucide="external-link" class="mr-3"></i> 専用ページを開く
                    </a>
                    <p class="text-[10px] text-pink-400 font-bold animate-pulse">お楽しみ中 ♡</p>
                `;
            } else {
                actionContainer.innerHTML = `<p class="text-xs text-gray-400 font-bold">メニューURL発行なしで入場済みです</p>`;
            }
            resView.appendChild(actionContainer);

        } else if (statusText === '終了') {
            document.getElementById('cancel-btn').classList.add('hidden');
            document.getElementById('qrcode').classList.add('hidden');
            
            actionContainer.innerHTML = `
                <div class="p-6 bg-slate-50 rounded-[30px] mb-4">
                    <p class="text-sm font-bold text-gray-500 mb-4">ご来店ありがとうございました♡</p>
                    <a href="${window.finishedUrl}" target="_blank" class="maid-btn w-full py-5 text-lg font-black flex items-center justify-center opacity-90 shadow-xl">
                        <i data-lucide="gift" class="mr-3"></i> アフターページ
                    </a>
                </div>
            `;
            resView.appendChild(actionContainer);

        } else {
            // Reserved or In-session but not checked in
            document.getElementById('cancel-btn').classList.remove('hidden');
            document.getElementById('qrcode').classList.remove('hidden', 'opacity-20', 'grayscale');
        }
        
        lucide.createIcons();
    } else {
        resView.classList.add('hidden');
        slotView.classList.remove('hidden');
        qrBtn.classList.remove('hidden');
    }
}

function renderNotifications(notes) {
    const container = document.getElementById('notifications');
    container.innerHTML = '';
    notes.forEach(note => {
        const div = document.createElement('div');
        div.className = `p-4 rounded-3xl text-xs font-bold flex items-start shadow-sm border ${note.is_urgent ? 'bg-red-50 text-red-600 border-red-100' : 'bg-white/50 text-pink-500 border-pink-50'}`;
        div.innerHTML = `
            <i data-lucide="${note.is_urgent ? 'alert-circle' : 'info'}" size="16" class="mr-2 shrink-0"></i>
            <p class="leading-relaxed">${note.message}</p>
        `;
        container.appendChild(div);
    });
    lucide.createIcons();
}

async function handleReserve(slotId) {
    if (currentReservation) return;
    
    const selectedSlot = window.allSlots.find(s => s.id === slotId);
    if (!selectedSlot) return;

    const modal = document.getElementById('general-qr-modal');
    const qrContainer = document.getElementById('general-qrcode');
    const modalTitle = modal.querySelector('h3');
    const modalDesc = modal.querySelector('p.text-xs');
    
    qrContainer.innerHTML = '';
    const qr = qrcode(0, 'M');
    qr.addData(`RESERVE:${slotId}:${userProfile.userId}:${userProfile.displayName}`);
    qr.make();
    qrContainer.innerHTML = qr.createImgTag(6);
    
    modalTitle.textContent = '予約用QR';
    const start = dayjs(selectedSlot.start_time).tz("Asia/Tokyo").format('HH:mm');
    modalDesc.innerHTML = `【${start}】の回で予約申請します。<br>このQRコードをスタッフに見せて予約を確定させてください。`;
    
    modal.classList.remove('hidden');
}

async function handleCancel() {
    if (!currentReservation) return;
    const start = dayjs(currentReservation.slots.start_time);
    if (start.diff(dayjs(), 'minute') < 30) {
        alert('開始30分前を切っているためキャンセルできません。');
        return;
    }
    if (!confirm('キャンセルしますか？')) return;
    
    const { error } = await supabaseClient
        .from('reservations')
        .update({ status: 'cancelled', updated_at: new Date().toISOString() })
        .eq('id', currentReservation.id)
        .eq('status', 'reserved');

    if (!error) {
        fetchData();
    } else {
        alert('キャンセルの実行に失敗しました。');
    }
}

function setupInteractions() {
    document.getElementById('refresh-btn').onclick = () => {
        const icon = document.querySelector('#refresh-btn svg') || document.querySelector('#refresh-btn i');
        if (icon) icon.classList.add('animate-spin');
        fetchData().finally(() => {
            if (icon) icon.classList.remove('animate-spin');
        });
    };
    
    document.getElementById('cancel-btn').onclick = handleCancel;
    
    document.getElementById('open-general-qr').onclick = () => {
        const modal = document.getElementById('general-qr-modal');
        const qrContainer = document.getElementById('general-qrcode');
        const modalTitle = modal.querySelector('h3');
        const modalDesc = modal.querySelector('p.text-xs');
        
        qrContainer.innerHTML = '';
        const qr = qrcode(0, 'M');
        qr.addData(`GENERAL:${userProfile.userId}:${userProfile.displayName}`);
        qr.make();
        qrContainer.innerHTML = qr.createImgTag(6);
        
        modalTitle.textContent = '通常受付';
        modalDesc.innerHTML = `このQRコードをスタッフに提示して、<br>直接相談して予約を確定してください。`;
        
        modal.classList.remove('hidden');
    };
    
    document.getElementById('close-modal').onclick = () => {
        document.getElementById('general-qr-modal').classList.add('hidden');
    };
}

function startScaryTimer() {
    setInterval(() => {
        if (Math.random() < 0.03) {
            document.getElementById('scary-layer').style.display = 'flex';
            document.getElementById('brand-name').textContent = 'イカナイデ…';
            document.body.style.filter = 'invert(1) grayscale(1)';
            setTimeout(() => {
                document.getElementById('scary-layer').style.display = 'none';
                document.getElementById('brand-name').textContent = 'Pinky Maid ♡';
                document.body.style.filter = 'none';
            }, 150);
        }
    }, 8000);
}

// Start app
init();
