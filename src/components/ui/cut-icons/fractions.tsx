import React from "react";
import { createCutIcon } from "./create-cut-icon";

export default createCutIcon("CutFractions", ({ weight, maskId }) => <>
<path d="M14 4A12 12 0 1 0 28 18H14Z M19 3V13H29Q28 5 19 3Z" fill="none" stroke="currentColor" strokeWidth={weight * 1.2} strokeLinejoin="round"/>
</>);
