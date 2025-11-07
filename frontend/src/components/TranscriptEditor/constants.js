// TranscriptEditor/constants.js - All constant values and static data

export const DUMMY_TICKERS = [
  // Semis
  "NVDA", "AMD", "TSM", "INTC", "AVGO",
  // Digital Media
  "META", "GOOG", "SNAP", "NFLX", "APP", "AMZN", "TTD", "ROKU", "RDDT",
  // Video Games
  "RBLX",
  // Cloud - SaaS / AI
  "MSFT", "ORCL", "FIG", "SNOW",
  // Cloud-SaaS additional
  "TEAM", "FRSH", "GTLB", "MNDY", "CRM", "NOW", "TWLO",
  // Security
  "CHKP", "CRWD", "CYRB", "FTNT", "OKTA", "PANW", "QLYS", "RBRK", "S", "VRNS", "ZS"
];

export const DUMMY_SUBSECTORS = [
  "Semis",
  "Digital Media",
  "Video Games",
  "Cloud / SaaS",
  "AI",
  "Privates",
  "Security"
];

export const SENTIMENT_COLORS = {
  "++": "#2ecc71",
  "+": "#a3e4d7",
  "=": "#f9f79f",
  "-": "#f5b7b1",
  "--": "#e74c3c"
};

export const TICKER_TO_DOMAIN = {
  "NVDA": "nvidia",
  "AMD": "amd",
  "TSM": "tsmc",
  "INTC": "intel",
  "AVGO": "broadcom",
  "META": "meta",
  "GOOG": "google",
  "SNAP": "snap",
  "NFLX": "netflix",
  "APP": "apptio",
  "AMZN": "amazon",
  "TTD": "thetradedesk",
  "ROKU": "roku",
  "RDDT": "reddit",
  "RBLX": "roblox",
  "MSFT": "microsoft",
  "ORCL": "oracle",
  "FIG": "fig",
  "SNOW": "snowflake",
  "TEAM": "atlassian",
  "FRSH": "freshworks",
  "GTLB": "gateleap",
  "MNDY": "monday",
  "CRM": "salesforce",
  "NOW": "servicenow",
  "TWLO": "twilio",
  "CHKP": "checkpoint",
  "CRWD": "crowdstrike",
  "CYRB": "cyberark",
  "FTNT": "fortinet",
  "OKTA": "okta",
  "PANW": "paloaltonetworks",
  "QLYS": "qualys",
  "RBRK": "rubrik",
  "S": "sentinelone",
  "VRNS": "veracode",
  "ZS": "zscaler"
};

export const DEFAULT_FORM_DATA = {
  dataTitle: "",
  tickers: [],
  subsectors: [],
  sentiment: "=",
  rating: 5
};
