import { readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
export const queueCounter = `def website_matchmaking_players(api):
    core = api.core
    if core is None:
        return 0
    now = api.clock()
    return len({player.id for ticket in core.tickets.values()
                if ticket.expires_at > now for player in ticket.players})


`;
export function patchMasterStatus(source: string): string {
  const marker = "class Directory:";
  const health = '"peers": self.peer_status})';
  if (
    !source.includes(marker) ||
    !source.includes(health) ||
    source.includes("website_matchmaking_players")
  )
    throw new Error("Unexpected master service source; refusing to patch");
  return source
    .replace(marker, queueCounter + marker)
    .replace(
      health,
      '"peers": self.peer_status, "matchmaking_players": website_matchmaking_players(self.matchmaking)})',
    );
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const [input, output] = process.argv.slice(2);
  if (!input || !output)
    throw new Error("Pass input and output service.py paths");
  await writeFile(output, patchMasterStatus(await readFile(input, "utf8")));
}
