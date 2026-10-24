import React from "react";
import { createCutIcon } from "./create-cut-icon";

export default createCutIcon("CutHome", ({ weight }) => <>
  <path d="M4.9 13.4L16 4.9L27.1 13.4V24Q27.1 27.1 24 27.1H20V18.8H12V27.1H8Q4.9 27.1 4.9 24Z" fill="inherit" fillRule="evenodd" stroke="currentColor" strokeWidth={weight * 1.3} strokeLinejoin="round"/>
</>);
