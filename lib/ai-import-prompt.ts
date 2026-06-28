export interface AIImportPromptOptions {
  relay?: boolean;
  scope?: "club" | "provincial" | "national";
  /** Allowed standard age-group names. When provided, the prompt restricts the AI to these exact values. */
  ageGroups?: string[];
  /** Relay event names to steer event naming. */
  relayEvents?: string[];
}

/**
 * Build a copy-pasteable prompt that instructs any AI assistant to convert a
 * club's raw records into a CSV that `parseRecordsCSV` accepts. Column set and
 * rules follow the PARSER's contract (not `generateCSVTemplate`): AgeGroup when
 * non-club scope or relay; Club when non-club; Province when national.
 */
export function generateAIImportPrompt(options: AIImportPromptOptions = {}): string {
  const isRelay = options.relay === true;
  const scope = options.scope ?? "club";
  const carriesClub = scope !== "club";
  const carriesProvince = scope === "national";
  const hasAgeGroup = isRelay || carriesClub;

  const swimmerCols = isRelay ? ["Name1", "Name2", "Name3", "Name4"] : ["Swimmer"];
  const flagCols = isRelay
    ? ["is_World_Record", "is_National", "is_Current_National", "is_Provincial", "is_Current_Provincial", "is_New"]
    : ["is_World_Record", "is_National", "is_Current_National", "is_Provincial", "is_Current_Provincial", "is_Split", "is_RelaySplit", "is_New"];

  const columns = [
    "Event",
    ...(hasAgeGroup ? ["AgeGroup"] : []),
    "Time",
    ...swimmerCols,
    ...(carriesClub ? ["Club"] : []),
    ...(carriesProvince ? ["Province"] : []),
    "Date",
    "Location",
    ...flagCols,
    "Notes",
  ];

  const rules: string[] = [
    "Output ONLY CSV: a header row exactly matching the columns below, then one row per record. No commentary, no explanations, no markdown code fences.",
    `Columns, in this exact order: ${columns.join(", ")}.`,
    "Time format: use MM:SS.hh for times of one minute or more (e.g. 1:02.34) and SS.hh for under a minute (e.g. 24.56). Never write minutes as a decimal.",
    "Date format: YYYY, YYYY-MM, or YYYY-MM-DD. If the date is unknown, leave it blank — do not guess.",
    "Flag columns (the is_* columns): put a lowercase x when true, otherwise leave the cell blank.",
    "One row per record. Do not merge multiple records into a single row.",
    "Do not invent data. If a value is not present in the source, leave that cell blank.",
    "Use the Notes column for any assumptions, uncertainties, or rows you were unsure about, so a human can review them. This column is ignored on import.",
  ];

  if (isRelay) {
    rules.push("This is a RELAY list. Each record is a four-person team: put the four swimmer names in Name1, Name2, Name3, Name4. If you only have the team name, put it in Name1 and leave Name2-Name4 blank.");
  }
  if (hasAgeGroup) {
    if (options.ageGroups && options.ageGroups.length > 0) {
      rules.push(`Every record needs an AgeGroup. Use ONLY these exact values: ${options.ageGroups.join(", ")}. Do not invent other age groups.`);
    } else {
      rules.push("Every record needs an AgeGroup.");
    }
  }
  if (carriesClub) {
    rules.push("Every record needs a Club (the club or team that holds the record).");
  }
  if (carriesProvince) {
    rules.push("Every record needs a Province (the record holder's province).");
  }
  if (isRelay && options.relayEvents && options.relayEvents.length > 0) {
    rules.push(`Where possible, match relay event names to these: ${options.relayEvents.join(", ")}.`);
  }

  const numbered = rules.map((rule, i) => `${i + 1}. ${rule}`).join("\n");

  return [
    "You are helping a swim club convert their existing records into a CSV file for upload to Club Record (clubrecord.ca).",
    "",
    "I will paste my records below. They may be messy — copied from a spreadsheet, a PDF, or a web page. Convert them into clean CSV following these rules:",
    "",
    numbered,
    "",
    "Use exactly this header row:",
    columns.join(","),
    "",
    "--- PASTE YOUR DATA BELOW ---",
    "",
  ].join("\n");
}
