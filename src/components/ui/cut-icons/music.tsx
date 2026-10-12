import React from "react";
import { createCutIcon } from "./create-cut-icon";

export default createCutIcon("CutMusic", ({ weight, maskId }) => <>
<path d="M14.2000 21.6080L14.2000 7.9701L25.8000 5.4844L25.8000 21.0000L26.8080 21.0000Q28.2000 21.0000 28.2000 19.6080L28.2000 2.5156L11.8000 6.0299L11.8000 23.0000L12.8080 23.0000Q14.2000 23.0000 14.2000 21.6080Z" fill="currentColor" fillRule="evenodd"/><path d="M13 23Q13 28 8 28Q4 28 4 24Q4 20 9 20H13 M27 21Q27 26 22 26Q18 26 18 22Q18 18 23 18H27" fill="none" stroke="currentColor" strokeWidth={weight * 1.2} strokeLinejoin="round"/>
</>);
