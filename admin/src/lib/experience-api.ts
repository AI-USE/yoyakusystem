import crypto from 'crypto';

/**
 * Experience System API Client
 * Optimized for low-bandwidth, high concurrency, robust endpoint formatting, and detailed error logging.
 */

const API_BASE = process.env.EXPERIENCE_API_URL || 'https://maid-menu-node.onrender.com/api';
const API_PASSWORD = process.env.EXPERIENCE_API_PASSWORD || 'maid2026';

/**
 * Normalizes URL endpoints to prevent double "/api" paths
 */
function getEndpoint(path: string): string {
    const base = API_BASE.replace(/\/$/, '');
    if (base.endsWith('/api')) {
        const cleanedPath = path.replace(/^\/api/, '');
        return `${base}${cleanedPath}`;
    }
    return `${base}${path}`;
}

function getHeaders() {
    return {
        'Content-Type': 'application/json',
        'X-Admin-Password': API_PASSWORD,
        'Authorization': `Bearer ${API_PASSWORD}`
    };
}

export type ExperienceApiResult<T> = {
    success: boolean;
    data: T | null;
    errorDetails?: string; // Rich debug information: Endpoint, Request Payload, Status, Error Response
};

/**
 * 4.2 Create Room (Single registration API)
 */
export async function createExperienceRoom(name: string): Promise<string | null> {
    try {
        const url = getEndpoint('/api/rooms');
        const payload = { name, phase: 'WAITING' };

        const res = await fetch(url, {
            method: 'POST',
            headers: getHeaders(),
            body: JSON.stringify(payload)
        });

        if (!res.ok) {
            const errorText = await res.text();
            console.error(`Failed to create experience room. URL: ${url}, Payload: ${JSON.stringify(payload)}, Status: ${res.status}, Response: ${errorText}`);
            return null;
        }

        const data = await res.json();
        return data.id; // Returns Room UUID
    } catch (err) {
        console.error('Experience API Error (createRoom):', err);
        return null;
    }
}

/**
 * 2.1 Create Room & Register Multiple Guests at once (Atomic high-efficiency API)
 */
export async function createExperienceRoomWithGuests(roomName: string, guests: string[]): Promise<{ roomId: string, guestUrls: Record<string, string> } | null> {
    try {
        const url = getEndpoint('/api/rooms-with-guests');
        const res = await fetch(url, {
            method: 'POST',
            headers: getHeaders(),
            body: JSON.stringify({ roomName, guests })
        });

        if (!res.ok) {
            console.error('Failed to create atomic room-with-guests:', await res.text());
            return null;
        }

        const data = await res.json();
        if (!data.ok || !data.room?.id) return null;

        const guestUrls: Record<string, string> = {};
        if (data.guests && Array.isArray(data.guests)) {
            for (const g of data.guests) {
                if (g.name && g.guestUrl) {
                    guestUrls[g.name] = g.guestUrl;
                }
            }
        }

        return {
            roomId: data.room.id,
            guestUrls
        };
    } catch (err) {
        console.error('Experience API Error (createRoomWithGuests):', err);
        return null;
    }
}

/**
 * 5.2 Create Single Guest (Matching successful test payload parameters)
 * Returns detailed ExperienceApiResult to help debug in the frontend
 */
export async function createExperienceGuestDetailed(name: string, roomId: string): Promise<ExperienceApiResult<{ guestUrl: string }>> {
    const url = getEndpoint('/api/guests');
    const sessionToken = `token-${crypto.randomUUID().slice(0, 8)}`;
    const payload = {
        name,
        roomId,
        sessionToken,
        isActive: true,
        isOnline: false
    };

    try {
        const res = await fetch(url, {
            method: 'POST',
            headers: getHeaders(),
            body: JSON.stringify(payload)
        });

        if (!res.ok) {
            const errorText = await res.text();
            const details = `【リクエスト詳細】
送信先: POST ${url}
送信データ: ${JSON.stringify(payload, null, 2)}

【エラーレスポンス】
ステータスコード: ${res.status}
返却内容: ${errorText}`;
            return { success: false, data: null, errorDetails: details };
        }

        const data = await res.json();
        if (!data?.guestUrl) {
            const details = `【リクエスト詳細】
送信先: POST ${url}
送信データ: ${JSON.stringify(payload, null, 2)}

【エラーレスポンス】
ステータスコード: ${res.status}
返却内容: guestUrlがレスポンスに含まれていません。
(全体データ: ${JSON.stringify(data)})`;
            return { success: false, data: null, errorDetails: details };
        }

        return { success: true, data: { guestUrl: data.guestUrl } };
    } catch (err: any) {
        const details = `【リクエスト詳細】
送信先: POST ${url}
送信データ: ${JSON.stringify(payload, null, 2)}

【エラーレスポンス】
接続エラー (Exception): ${err.message}`;
        return { success: false, data: null, errorDetails: details };
    }
}

/**
 * Legacy wrapper for compatibility (fallback)
 */
export async function createExperienceGuest(name: string, roomId: string): Promise<{ guestUrl: string } | null> {
    const res = await createExperienceGuestDetailed(name, roomId);
    return res.success ? res.data : null;
}
