-- ==========================================
-- 1. テーブル作成
-- ==========================================

-- 時間枠テーブル
CREATE TABLE slots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    start_time TIMESTAMPTZ NOT NULL,
    end_time TIMESTAMPTZ NOT NULL,
    capacity INTEGER NOT NULL DEFAULT 10,
    is_cancelled BOOLEAN NOT NULL DEFAULT FALSE,
    publish_at TIMESTAMPTZ DEFAULT NOW(), -- 枠の公開日時
    room_id UUID, -- 体験用ルームID
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 予約招待テーブル (仮確保・特別招待用)
CREATE TABLE invitations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slot_id UUID REFERENCES slots(id) ON DELETE CASCADE,
    token TEXT UNIQUE NOT NULL DEFAULT gen_random_uuid()::text,
    expires_at TIMESTAMPTZ NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'used', 'expired'
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ブラックリスト
CREATE TABLE blacklist (
    line_user_id TEXT PRIMARY KEY,
    reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 予約テーブル
CREATE TABLE reservations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slot_id UUID REFERENCES slots(id) ON DELETE CASCADE,
    line_user_id TEXT, -- NULLは名前のみ登録用
    user_name TEXT,
    reception_number SERIAL,
    status TEXT NOT NULL DEFAULT 'reserved', -- 'reserved', 'checked_in', 'finished', 'cancelled'
    qr_code_token TEXT UNIQUE DEFAULT gen_random_uuid()::text,
    experience_url TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- グローバル設定
CREATE TABLE global_settings (
    key TEXT PRIMARY KEY,
    value TEXT,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO global_settings (key, value) VALUES ('finished_url', 'https://example.com/finished');

-- お知らせ
CREATE TABLE notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slot_id UUID REFERENCES slots(id) ON DELETE CASCADE,
    message TEXT NOT NULL,
    is_urgent BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ==========================================
-- 2. セキュリティ設定 (RLS)
-- ==========================================

ALTER TABLE slots ENABLE ROW LEVEL SECURITY;
ALTER TABLE invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE blacklist ENABLE ROW LEVEL SECURITY;
ALTER TABLE reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE global_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- Slots: 誰でも閲覧可能
CREATE POLICY "Enable read for all" ON slots FOR SELECT USING (TRUE);

-- Invitations: 誰でも閲覧可能
CREATE POLICY "Enable read for all" ON invitations FOR SELECT USING (TRUE);

-- Global Settings: 誰でも閲覧可能
CREATE POLICY "Enable read for all" ON global_settings FOR SELECT USING (TRUE);

-- Notifications: 誰でも閲覧可能
CREATE POLICY "Enable read for all" ON notifications FOR SELECT USING (TRUE);

-- Reservations: 
-- 1. 誰でも閲覧可能（アプリ側で line_user_id でフィルタリング）
CREATE POLICY "Enable read for all" ON reservations FOR SELECT USING (TRUE);

-- 2. 利用者本人によるキャンセル（UPDATE）のみ許可
CREATE POLICY "Enable update for users (cancel only)" ON reservations
    FOR UPDATE
    USING (status = 'reserved')
    WITH CHECK (status = 'cancelled');

-- Blacklist: 読み取りのみ許可（LIFFでのチェック用）
CREATE POLICY "Enable read for all" ON blacklist FOR SELECT USING (TRUE);

-- 全テーブル、管理者（service_role）は全権限を持つ

-- ==========================================
-- 3. インデックス
-- ==========================================
CREATE INDEX idx_res_line_id ON reservations(line_user_id);
CREATE INDEX idx_res_token ON reservations(qr_code_token);
CREATE INDEX idx_slots_start ON slots(start_time);
CREATE INDEX idx_invitations_token ON invitations(token);

-- ==========================================
-- 4. ビュー (最適化用)
-- ==========================================
CREATE OR REPLACE VIEW slot_availability AS
SELECT 
    s.*,
    (
        (
            SELECT COUNT(*)::INTEGER
            FROM reservations r
            WHERE r.slot_id = s.id AND r.status != 'cancelled'
        ) + (
            SELECT COUNT(*)::INTEGER
            FROM invitations i
            WHERE i.slot_id = s.id AND i.status = 'pending' AND i.expires_at > NOW()
        )
    ) as reserved_count
FROM slots s;

-- ビューへのアクセス許可
ALTER VIEW slot_availability OWNER TO postgres;
GRANT SELECT ON slot_availability TO anon, authenticated, service_role;

-- ==========================================
-- 5. アトミック予約関数 (RPC)
-- ==========================================
CREATE OR REPLACE FUNCTION reserve_slot(p_slot_id UUID, p_line_user_id TEXT, p_user_name TEXT)
RETURNS JSON AS $$
DECLARE
    v_capacity INTEGER;
    v_reserved INTEGER;
    v_reservation_id UUID;
BEGIN
    -- 1. ブラックリストチェック
    IF EXISTS (SELECT 1 FROM blacklist WHERE line_user_id = p_line_user_id) THEN
        RETURN json_build_object('success', false, 'message', 'このアカウントは現在ご利用いただけません');
    END IF;

    -- 2. 既存予約チェック (LINE IDがある場合のみ)
    IF p_line_user_id IS NOT NULL AND EXISTS (SELECT 1 FROM reservations WHERE line_user_id = p_line_user_id AND status != 'cancelled') THEN
        RETURN json_build_object('success', false, 'message', '既に予約済みです');
    END IF;

    -- 3. 枠のロックと定員チェック (有効期限内の招待枠もカウント)
    SELECT capacity INTO v_capacity FROM slots WHERE id = p_slot_id FOR UPDATE;
    SELECT
        (SELECT count(*) FROM reservations WHERE slot_id = p_slot_id AND status != 'cancelled') +
        (SELECT count(*) FROM invitations WHERE slot_id = p_slot_id AND status = 'pending' AND expires_at > NOW())
    INTO v_reserved;
    
    IF v_reserved >= v_capacity THEN
        RETURN json_build_object('success', false, 'message', '満席のため予約できませんでした');
    END IF;

    -- 4. 予約挿入
    INSERT INTO reservations (slot_id, line_user_id, user_name)
    VALUES (p_slot_id, p_line_user_id, p_user_name)
    RETURNING id INTO v_reservation_id;

    RETURN json_build_object('success', true, 'id', v_reservation_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 6. 招待コードを使用したアトミック予約関数
CREATE OR REPLACE FUNCTION redeem_invitation(p_token TEXT, p_line_user_id TEXT, p_user_name TEXT)
RETURNS JSON AS $$
DECLARE
    v_invitation RECORD;
    v_reservation_id UUID;
BEGIN
    -- 1. ブラックリストチェック
    IF EXISTS (SELECT 1 FROM blacklist WHERE line_user_id = p_line_user_id) THEN
        RETURN json_build_object('success', false, 'message', 'このアカウントは現在ご利用いただけません');
    END IF;

    -- 2. 既存予約チェック
    IF p_line_user_id IS NOT NULL AND EXISTS (SELECT 1 FROM reservations WHERE line_user_id = p_line_user_id AND status != 'cancelled') THEN
        RETURN json_build_object('success', false, 'message', '既に予約済みです');
    END IF;

    -- 3. 招待情報の取得と検証 (ロック)
    SELECT * INTO v_invitation FROM invitations WHERE token = p_token FOR UPDATE;

    IF v_invitation.id IS NULL THEN
        RETURN json_build_object('success', false, 'message', '無効な招待リンクです');
    END IF;

    IF v_invitation.status != 'pending' OR v_invitation.expires_at <= NOW() THEN
        RETURN json_build_object('success', false, 'message', 'この招待リンクは有効期限切れか既に利用されています');
    END IF;

    -- 4. 予約挿入
    INSERT INTO reservations (slot_id, line_user_id, user_name)
    VALUES (v_invitation.slot_id, p_line_user_id, p_user_name)
    RETURNING id INTO v_reservation_id;

    -- 5. 招待ステータスの更新
    UPDATE invitations SET status = 'used' WHERE id = v_invitation.id;

    RETURN json_build_object('success', true, 'id', v_reservation_id, 'slot_id', v_invitation.slot_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
