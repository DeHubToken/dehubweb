import React from "react";
import { createCutIcon } from "./create-cut-icon";

export default createCutIcon("CutLocation", ({ weight, maskId }) => <>
<path d="M16 29Q5 18 5 12A11 11 0 0 1 27 12Q27 18 16 29Z M20 12A4 4 0 1 1 12 12A4 4 0 1 1 20 12Z" fill="none" stroke="currentColor" strokeWidth={weight * 1.2} strokeLinejoin="round"/>
</>);
