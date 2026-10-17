import type { APIRoute } from "astro";
import matchesJson from "@/data/matches.json";
import { MatchesDataSchema } from "@/lib/schema";

export const GET: APIRoute = () => {
  const matchesData = MatchesDataSchema.parse(matchesJson);
  return new Response(
    JSON.stringify({
      status: "ok",
      framework: "astro-zod",
      service: "sfl-scenario-simulator",
      updatedAt: matchesData.updatedAt,
      completedSectionCount: matchesData.completedSectionCount,
    }),
    {
      status: 200,
      headers: {
        "Content-Type": "application/json",
      },
    }
  );
};
