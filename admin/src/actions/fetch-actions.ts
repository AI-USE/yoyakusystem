'use server';

import { supabaseAdmin } from '@/lib/supabase';

/**
 * Fetch initial data for slots page
 */
export async function getSlotsData() {
    // Optimization: Use pre-aggregated view to reduce server-side JS processing
    const { data, error } = await supabaseAdmin
        .from('slot_availability')
        .select('id, start_time, end_time, capacity, reserved_count, is_cancelled')
        .order('start_time', { ascending: true });
    
    if (error) {
        console.error('getSlotsData error:', error);
        return [];
    }
    return data;
}

/**
 * Fetch today's slots for reception
 */
export async function getTodaySlots() {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date();
    end.setHours(23, 59, 59, 999);

    const { data, error } = await supabaseAdmin
      .from('slot_availability')
      .select('id, start_time, end_time, capacity, reserved_count')
      .gte('start_time', start.toISOString())
      .lte('start_time', end.toISOString())
      .order('start_time', { ascending: true });
    
    if (error) {
        console.error('getTodaySlots error:', error);
        return [];
    }
    return data;
}

/**
 * Fetch reservations for a specific slot
 */
export async function getReservationsBySlot(slotId: string) {
    const { data, error } = await supabaseAdmin
        .from('reservations')
        .select('id, user_name, reception_number, status, line_user_id')
        .eq('slot_id', slotId)
        .neq('status', 'cancelled')
        .order('reception_number', { ascending: true });
    
    if (error) {
        console.error('getReservationsBySlot error:', error);
        return [];
    }
    return data;
}

/**
 * Fetch blacklist
 */
export async function getBlacklist() {
    const { data, error } = await supabaseAdmin
        .from('blacklist')
        .select('line_user_id, reason, created_at')
        .order('created_at', { ascending: false });
    
    if (error) {
        console.error('getBlacklist error:', error);
        return [];
    }
    return data;
}

/**
 * Fetch recent reservations
 */
export async function getRecentReservations() {
    const { data, error } = await supabaseAdmin
        .from('reservations')
        .select('id, user_name, status, created_at, slots(start_time)')
        .order('created_at', { ascending: false })
        .limit(100);
    
    if (error) {
        console.error('getRecentReservations error:', error);
        return [];
    }
    return data;
}

/**
 * Fetch notifications
 */
export async function getNotifications() {
    const { data, error } = await supabaseAdmin
        .from('notifications')
        .select('id, message, is_urgent, created_at, slots(start_time)')
        .order('created_at', { ascending: false });
    
    if (error) {
        console.error('getNotifications error:', error);
        return [];
    }
    return data;
}
