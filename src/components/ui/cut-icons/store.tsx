import React from "react";
import { createCutIcon } from "./create-cut-icon";

export default createCutIcon("CutStore", ({ weight, maskId }) => <>
<path d="M4 12L7 5H25L28 12V15Q24 19 20 15Q16 19 12 15Q8 19 4 15Z M6 18V28H26V18 M13 28V21H20V28" fill="none" stroke="currentColor" strokeWidth={weight * 1.2} strokeLinejoin="round"/><path d="M10.6366 6.2324L9.8093 12.8512L10.8095 12.9762Q12.1907 13.1488 12.3634 11.7676L13.1907 5.1488L12.1905 5.0238Q10.8093 4.8512 10.6366 6.2324Z" fill="currentColor" fillRule="evenodd"/><path d="M18.9819 6.5301L19.8093 13.1488L20.8095 13.0238Q22.1907 12.8512 22.0181 11.4699L21.1907 4.8512L20.1905 4.9762Q18.8093 5.1488 18.9819 6.5301Z" fill="currentColor" fillRule="evenodd"/>
</>);
