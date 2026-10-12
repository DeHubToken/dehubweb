import React from "react";
import { createCutIcon } from "./create-cut-icon";

export default createCutIcon("CutCamera", ({ weight, maskId }) => <>
<path d="M4 10H9L12 5H21L24 10H28V22Q28 27 23 27H4Z M22 18A6 6 0 1 1 10 18A6 6 0 1 1 22 18Z" fill="none" stroke="currentColor" strokeWidth={weight * 1.2} strokeLinejoin="round"/>
</>);
