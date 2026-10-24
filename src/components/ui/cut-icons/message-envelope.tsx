import React from "react";
import { createCutIcon } from "./create-cut-icon";

export default createCutIcon("CutMessageEnvelope", ({ weight }) => <>
  <path d="M4 5H20.2Q28 5 28 12.8V27H11.8Q4 27 4 19.2Z M6.6 7.6V19.2Q6.6 24.4 11.8 24.4H25.4V12.8Q25.4 7.6 20.2 7.6Z" fill="currentColor" fillRule="evenodd"/><path d="M6 8L16 16.6L26 8" fill="none" fillRule="evenodd" stroke="currentColor" strokeWidth={weight * 1.3} strokeLinejoin="round"/>
</>);
