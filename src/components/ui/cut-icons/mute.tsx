import React from "react";
import { createCutIcon } from "./create-cut-icon";

export default createCutIcon("CutMute", ({ weight, maskId }) => <>
<path d="M4 12H9L17 5V27L9 20H4Z" fill="none" stroke="currentColor" strokeWidth={weight * 1.2} strokeLinejoin="round"/><path d="M22.0135 13.8378L28.0969 20.7902L28.8555 20.1264Q29.9031 19.2098 28.9865 18.1622L22.9031 11.2098L22.1445 11.8736Q21.0969 12.7902 22.0135 13.8378Z" fill="currentColor" fillRule="evenodd"/><path d="M27.1803 12.2574L21.0969 19.2098L21.8555 19.8736Q22.9031 20.7902 23.8197 19.7426L29.9031 12.7902L29.1445 12.1264Q28.0969 11.2098 27.1803 12.2574Z" fill="currentColor" fillRule="evenodd"/>
</>);
