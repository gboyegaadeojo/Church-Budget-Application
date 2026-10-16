"use server";

import { auth } from "@/auth";
import { getDb } from "@/db";
import { globalSearch, type SearchResult } from "@/domain/search";
import { loadViewer } from "@/domain/users/viewer";

/** Global search for the signed-in person; nothing for anyone else. */
export async function searchAction(query: string): Promise<SearchResult[]> {
  const userId = (await auth())?.user?.id;
  if (!userId || typeof query !== "string") return [];
  const db = getDb();
  const loaded = await loadViewer(db, userId);
  if (!loaded.ok) return [];
  return globalSearch(db, loaded.viewer, query);
}
