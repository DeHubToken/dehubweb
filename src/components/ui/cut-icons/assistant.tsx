import React from "react";
import { createCutIcon } from "./create-cut-icon";

export default createCutIcon("CutAssistant", ({ weight, maskId }) => <>
<path d="M16 3L19.5 12.5L29 16L19.5 19.5L16 29L12.5 19.5L3 16L12.5 12.5Z" fill="none" stroke="currentColor" strokeWidth={weight * 1.2} strokeLinejoin="round"/><path d="M24.1000 4.0440L24.1000 8.0000L24.8560 8.0000Q25.9000 8.0000 25.9000 6.9560L25.9000 3.0000L25.1440 3.0000Q24.1000 3.0000 24.1000 4.0440Z" fill="currentColor" fillRule="evenodd"/><path d="M23.5440 6.4000L27.5000 6.4000L27.5000 5.6440Q27.5000 4.6000 26.4560 4.6000L22.5000 4.6000L22.5000 5.3560Q22.5000 6.4000 23.5440 6.4000Z" fill="currentColor" fillRule="evenodd"/>
</>);
