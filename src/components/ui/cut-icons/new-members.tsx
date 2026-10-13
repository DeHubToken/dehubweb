import React from "react";
import { createCutIcon } from "./create-cut-icon";

export default createCutIcon("CutNewmembers", ({ weight }) => <>
<path d="M16 3L19.4 10.3Q19.8 11.2 20.8 11.3L28.8 12.3L23 18Q22.3 18.7 22.5 19.7L24 28L16.9 24Q16 23.5 15.1 24L8 28L9.5 19.7Q9.7 18.7 9 18L3.2 12.3L11.2 11.3Q12.2 11.2 12.6 10.3Z" fill="none" stroke="currentColor" strokeWidth={weight * 1.2} strokeLinejoin="round"/>
</>);
