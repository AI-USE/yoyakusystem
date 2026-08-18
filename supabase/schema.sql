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
    room_id UUID, -- 体験用ルームID
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
ALTER TABLE blacklist ENABLE ROW LEVEL SECURITY;
ALTER TABLE reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE global_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- Slots: 誰でも閲覧可能
CREATE POLICY "Enable read for all" ON slots FOR SELECT USING (TRUE);

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

-- ==========================================
-- 4. ビュー (最適化用)
-- ==========================================
CREATE OR REPLACE VIEW slot_availability AS
SELECT 
    s.*,
    (
        SELECT COUNT(*)::INTEGER 
        FROM reservations r 
        WHERE r.slot_id = s.id AND r.status != 'cancelled'
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

    -- 3. 枠のロックと定員チェック
    SELECT capacity INTO v_capacity FROM slots WHERE id = p_slot_id FOR UPDATE;
    SELECT count(*) INTO v_reserved FROM reservations WHERE slot_id = p_slot_id AND status != 'cancelled';
    
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
