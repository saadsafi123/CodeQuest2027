// Purpose: Supabase implementation of UserRepository (+ SystemRepository for reset).
import "server-only";
import seedData from "@/data/seed-users.json";
import { getSupabase } from "../supabase";
import type { Department, Role, SystemRepository, User, UserRepository } from "./types";

interface UserRow {
  id: string;
  name: string;
  role: Role;
  department: Department | null;
  trust_score: number | string;
  created_at: string;
}

const COLUMNS = "id,name,role,department,trust_score,created_at";

function toUser(r: UserRow): User {
  return {
    id: r.id,
    name: r.name,
    role: r.role,
    department: r.department,
    trustScore: Number(r.trust_score),
    createdAt: r.created_at,
  };
}

export const userRepository: UserRepository = {
  async list() {
    const { data, error } = await getSupabase()
      .from("users")
      .select(COLUMNS)
      .order("role", { ascending: true })
      .order("created_at", { ascending: true });
    if (error) throw new Error(`users.list failed: ${error.message}`);
    return (data as UserRow[]).map(toUser);
  },

  async getById(id) {
    const { data, error } = await getSupabase().from("users").select(COLUMNS).eq("id", id).maybeSingle();
    if (error) throw new Error(`users.getById failed: ${error.message}`);
    return data ? toUser(data as UserRow) : null;
  },

  async createStudent(name) {
    const { data, error } = await getSupabase()
      .from("users")
      .insert({ name, role: "student", department: null })
      .select(COLUMNS)
      .single();
    if (error) throw new Error(`users.createStudent failed: ${error.message}`);
    return toUser(data as UserRow);
  },

  async trustProfiles(userIds) {
    if (userIds.length === 0) return [];
    const { data, error } = await getSupabase().rpc("user_trust_profiles", { p_user_ids: userIds });
    if (error) throw new Error(`users.trustProfiles failed: ${error.message}`);
    return ((data ?? []) as { user_id: string; trust_score: number | string; created_at: string; ledger_events: number | string }[]).map((u) => ({
      userId: u.user_id,
      trustScore: Number(u.trust_score),
      createdAt: u.created_at,
      ledgerEvents: Number(u.ledger_events),
    }));
  },

  async ledgerScore(userId) {
    const db = getSupabase();
    const { data, error } = await db.from("user_trust_rebuilt").select("rebuilt_score,cached_score").eq("user_id", userId).maybeSingle();
    if (error) throw new Error(`users.ledgerScore failed: ${error.message}`);
    if (!data) return null;
    const rebuilt = Number(data.rebuilt_score);
    if (Math.abs(rebuilt - Number(data.cached_score)) > 0.005) await db.rpc("rebuild_trust_scores"); // self-heal a drifted cache
    return rebuilt;
  },

  async seedDemoUsers() {
    const db = getSupabase();
    const DAY = 86_400_000;
    const now = Date.now();
    const iso = (daysAgo: number) => new Date(now - daysAgo * DAY).toISOString();

    // Backdated accounts so the anti-brigading cap (young account / few ledger events) does not hit demo users.
    const rows = seedData.users.map((u) => ({
      id: u.id,
      name: u.name,
      role: u.role,
      department: u.department,
      trust_score: u.trust_score,
      is_demo_seed: true,
      created_at: iso(u.created_days_ago),
    }));
    const { error } = await db.from("users").upsert(rows, { onConflict: "id" });
    if (error) throw new Error(`seed users failed: ${error.message}`);

    // Re-seeding must not duplicate ledger rows.
    const ids = seedData.users.map((u) => u.id);
    const { error: delErr } = await db.from("trust_events").delete().in("user_id", ids);
    if (delErr) throw new Error(`seed trust events cleanup failed: ${delErr.message}`);

    // Ledger history: every cached score equals 50 + sum(deltas), so it is fully explainable.
    const events = seedData.users.flatMap((u) =>
      u.ledger.flatMap((e) =>
        Array.from({ length: e.count }, (_, i) => ({
          user_id: u.id,
          delta: e.delta,
          reason: e.reason,
          // spread repeated events over a few hours so ordering is stable
          created_at: new Date(now - e.days_ago * DAY + i * 3_600_000).toISOString(),
        })),
      ),
    );
    if (events.length) {
      const { error: evErr } = await db.from("trust_events").insert(events);
      if (evErr) throw new Error(`seed trust events failed: ${evErr.message}`);
    }
    return rows.length;
  },
};

export const systemRepository: SystemRepository = {
  async resetAllData() {
    const { error } = await getSupabase().rpc("reset_all_data");
    if (error) throw new Error(`reset_all_data failed: ${error.message}`);
  },
};
