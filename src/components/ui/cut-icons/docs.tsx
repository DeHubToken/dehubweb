import React from "react";
import { createCutIcon } from "./create-cut-icon";

export default createCutIcon("CutDocs", ({ weight, maskId }) => <>
<path d="M16 9Q12 5 4 5V24Q12 24 16 28Q20 24 28 24V5Q20 5 16 9V28" fill="none" stroke="currentColor" strokeWidth={weight * 1.2} strokeLinejoin="round"/><path d="M8.8387 12.1889L11.7696 12.9216L11.9631 12.1475Q12.2304 11.0784 11.1613 10.8111L8.2304 10.0784L8.0369 10.8525Q7.7696 11.9216 8.8387 12.1889Z" fill="currentColor" fillRule="evenodd"/><path d="M21.2995 12.6544L24.2304 11.9216L24.0369 11.1475Q23.7696 10.0784 22.7005 10.3456L19.7696 11.0784L19.9631 11.8525Q20.2304 12.9216 21.2995 12.6544Z" fill="currentColor" fillRule="evenodd"/>
</>);
