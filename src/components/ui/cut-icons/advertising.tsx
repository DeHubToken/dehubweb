import React from "react";
import { createCutIcon } from "./create-cut-icon";

export default createCutIcon("CutAdvertising", ({ weight, maskId }) => <>
<path d="M4 12H12L26 5V25L12 19H4Z M12 19L15 28H9L6 19" fill="none" stroke="currentColor" strokeWidth={weight * 1.2} strokeLinejoin="round"/><path d="M27.9000 13.2760L27.9000 18.0000L28.8240 18.0000Q30.1000 18.0000 30.1000 16.7240L30.1000 12.0000L29.1760 12.0000Q27.9000 12.0000 27.9000 13.2760Z" fill="currentColor" fillRule="evenodd"/>
</>);
