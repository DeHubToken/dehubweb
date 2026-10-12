import React from "react";
import { createCutIcon } from "./create-cut-icon";

export default createCutIcon("CutHandshake", ({ weight, maskId }) => <>
<g transform="translate(1.3 1.3) scale(1.225)"><defs><mask id={maskId} maskUnits="userSpaceOnUse" x="-2" y="-2" width="30" height="30"><rect x="-2" y="-2" width="30" height="30" fill="white"/><path transform="translate(14 14) rotate(43.73)" d="M-1 -2H1.05V-.9H.95Q0 -.9 0 .05V1H-1Z" fill="black"/><path transform="translate(11 16.7) rotate(42.97)" d="M-1 -2H1.05V-.9H.95Q0 -.9 0 .05V1H-1Z" fill="black"/></mask></defs><g mask={`url(#${maskId})`}><path d="M3 5H8.6Q10 5 11 6 M21 5L18.7 5.4Q17.8 5.5 17 5L16.5 4.7Q13.6 3 10.8 5.4L7.9 8.3Q6.6 9.6 7.9 10.9Q9.1 12.1 10.4 10.9L12 9.3Q13.4 8 15 9.5L19 13.5Q20.4 15 19 16.3Q17.7 17.6 16.3 16.2L14 14 M16.3 16.2Q18.1 18 16.6 19.4Q15.1 20.8 13.5 19.2L11 16.7 M13.5 19.2Q15 20.7 13.4 22Q12.1 23 10.8 21.7C7.8 19.4 3 18.2 3 14" fill="none" stroke="currentColor" strokeWidth={weight * 0.9} strokeLinejoin="round"/><path d="M1.15 3H2.15Q3.9 3 3.9 4.75V14.9H1.15ZM20.1 3H21.1Q22.85 3 22.85 4.75V14.9H20.1Z" fill="currentColor"/></g></g>
</>);
