/**
 * 選手ごとの対戦データ詳細 (静的生成: /data/players/{playerKey}.json)
 *
 * 選手図鑑の詳細を開いたときだけ読み込む。選手一覧ページに全員分を埋め込むと重くなるため分離している。
 */
import type { APIRoute, GetStaticPaths } from "astro";
import rawStartggResults from "@/data/startgg-premier-results.json";
import rawStartggIdentities from "@/data/startgg-identities.json";
import { StartggIdentitiesDataSchema, StartggPremierResultsDataSchema } from "@/lib/schema";
import { buildPlayerMatchDetail } from "@/lib/player-encyclopedia/match-detail";

const results = StartggPremierResultsDataSchema.parse(rawStartggResults);
const identities = StartggIdentitiesDataSchema.parse(rawStartggIdentities);

export const getStaticPaths: GetStaticPaths = () =>
  Object.keys(identities.players).map((playerKey) => ({ params: { playerKey } }));

export const GET: APIRoute = ({ params }) => {
  const detail = buildPlayerMatchDetail(String(params.playerKey), results, identities);
  return new Response(JSON.stringify(detail), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
};
