import React from "react";
import { createCutIcon } from "./create-cut-icon";

export default createCutIcon("CutSecurity", ({ weight, maskId }) => <>
<path d="M16 3L27 7V16Q27 24 16 29Q5 24 5 16V7Z" fill="none" stroke="currentColor" strokeWidth={weight * 1.2} strokeLinejoin="round"/><path d="M10.1358 16.8328L14.0000 20.6971L22.8485 11.8485L22.1358 11.1358Q21.1515 10.1515 20.1672 11.1358L14.0000 17.3029L10.8485 14.1515L10.1358 14.8642Q9.1515 15.8485 10.1358 16.8328Z" fill="currentColor" fillRule="evenodd"/>
</>);
