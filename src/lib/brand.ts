// Purpose: the ONE place for the university's identity. EVERYTHING HERE IS A PLACEHOLDER: replace these values with the
// real university details and every header, footer, page title and the help pages update. No other file hard-codes them.
export const BRAND = {
  /** Full university name (shown in the header, in serif). */
  universityName: "MCS, NUST",
  /** Short name (utility bar, breadcrumbs, window titles). */
  shortName: "MCS",
  /** The service this app provides. */
  serviceName: "Issue Reporting & Resolution",
  /** The hackathon team that built it (shown in the footer). */
  teamName: "Sixth Sense",
  /** The software behind it (shown small, never as the whole brand). */
  productName: "ReportFix",
  /** PLACEHOLDER: campus services unit that owns the service. */
  unitName: "Campus Services",
  /** PLACEHOLDER contact details (footer and help). */
  address: ["Main Campus", "123 University Road", "City, Country"],
  phone: "+00 000 000 0000",
  email: "campus.services@university.example",
  hours: "Monday to Friday, 9:00 to 17:00",
} as const;

export const PAGE_TITLE_SUFFIX = ` · ${BRAND.serviceName} · ${BRAND.shortName}`;
