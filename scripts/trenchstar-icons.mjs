import fs from 'node:fs';
import path from 'node:path';
const out=path.resolve('public/trenchstar-game/icons');
const shapes={
  focus:'M10 15H50Q54 15 54 19V41Q54 45 50 45H36V50H44V54H20V50H28V45H10Q6 45 6 41V19Q6 15 10 15Z',
  desk:'M7 29L29 18L55 30L33 42Z M10 33V49L15 52V36 M49 34V49L44 52V37',
  room:'M6 31L19 24L32 31V48L19 55L6 48Z M30 17L43 10L56 17V34L43 41L30 34Z',
  trophy:'M20 10H43V26Q43 36 35 39V47H44V53H18V47H27V39Q19 36 19 26Z M19 15H9V23Q9 33 21 33V27Q15 27 15 21H19 M43 15H53V23Q53 33 41 33V27Q47 27 47 21H43',
  bell:'M28 10Q32 6 36 10V15Q46 18 46 31V38L51 44V48H13V44L18 38V31Q18 18 28 15Z M26 51H38Q36 59 29 55Z',
  wallet:'M9 17L43 10Q47 9 47 15V20H51V49H10Q6 49 6 44V23Q6 19 9 17Z',
  search:'M27 9A18 18 0 1 0 27 45A18 18 0 1 0 27 9Z M39 39L45 37L57 49Q60 54 54 57Z',
  avatar:'M23 15A10 10 0 1 0 43 15A10 10 0 1 0 23 15Z M14 49Q14 32 33 32Q52 32 52 49V53H14Z',
  exit:'M10 10H35V17H17V47H35V54H10Z M37 21L52 32L37 43V36H24V28H37Z',
  add:'M25 9H39V25H55V39H39V55H25V39H9V25H25Z',
  cast:'M12 10H53V43H35V37H47V16H12V22H6V16Q6 10 12 10Z M8 30Q31 30 31 53H24Q24 37 8 37Z M8 42Q19 42 19 53H12Q12 49 8 49Z M7 51H12V56H7Z',
  settings:'M26 8H38L40 16L47 20L55 18L60 29L53 35V42L55 48L45 55L38 50H29L22 55L11 48L14 40V33L7 28L12 17L21 19L26 15Z',
  environment:'M5 49L22 16L35 38L44 25L60 49Z',
  star:'M32 7L40 22L57 25L45 38L48 55L32 47L16 55L19 38L7 25L24 22Z',
  close:'M17 10L32 25L47 10L55 18L40 33L55 48L47 56L32 41L17 56L9 48L24 33L9 18Z',
  save:'M11 9H44L54 19V54H10V9Z',
  trash:'M16 20H48L45 54H19Z M11 11H25V6H39V11H53V17H11Z',
  mic:'M25 7H39Q43 7 43 12V31Q43 43 32 43Q21 43 21 31V12Q21 7 25 7Z M13 26H18V33Q18 47 32 47Q46 47 46 33V26H51V34Q51 50 35 52V57H29V52Q13 50 13 34Z',
  link:'M29 14L35 8Q47 0 55 12Q61 21 52 30L43 39L37 33L46 24Q50 19 46 15Q42 11 38 16L32 22Z M35 49L29 55Q17 63 9 51Q3 42 12 33L21 24L27 30L18 39Q14 44 18 48Q22 52 26 47L32 41Z M20 38L38 20L44 26L26 44Z',
  play:'M18 8L54 30Q58 32 54 35L18 57Q13 59 13 53V12Q13 6 18 8Z',
  volume:'M7 24H18L35 10V54L18 40H7Z M43 20Q53 32 43 44L39 40Q46 32 39 24Z',
  buy:'M32 7L54 29H40V55H24V29H10Z',
  sell:'M24 8H40V34H54L32 56L10 34H24Z',
};
const details={
  focus:'<path d="M14 34L22 28L29 32L39 21L47 24" fill="none" stroke="ACCENT" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>',
  desk:'<path d="M20 27V12L39 8V25L20 30Z" fill="DARK" stroke="EDGE"/><path d="M24 22L28 18L32 20L36 14" fill="none" stroke="ACCENT" stroke-width="2"/>',
  room:'<path d="M6 31L19 38L32 31M19 38V54M30 17L43 24L56 17M43 24V40" fill="none" stroke="ACCENT" stroke-width="1.5"/>',
  trophy:'<path d="M31 16L34 22L41 23L36 28L37 34L31 31L25 34L26 28L21 23L28 22Z" fill="ACCENT"/>',
  bell:'<path d="M25 29Q25 20 32 20" fill="none" stroke="ACCENT" stroke-width="3" stroke-linecap="round"/>',
  wallet:'<path d="M34 29H54V41H34Q29 35 34 29Z" fill="DARK" stroke="EDGE"/><circle cx="38" cy="35" r="2.5" fill="ACCENT"/><path d="M13 21L42 15" stroke="ACCENT" stroke-width="2"/>',
  search:'<circle cx="27" cy="27" r="11" fill="DARK" stroke="ACCENT" stroke-width="2"/><path d="M21 22Q23 18 28 18" stroke="white" stroke-opacity=".6" stroke-width="2" fill="none" stroke-linecap="round"/>',
  avatar:'<path d="M25 16Q26 10 32 10" stroke="ACCENT" stroke-width="2.5" fill="none" stroke-linecap="round"/><path d="M20 47Q21 38 31 38" stroke="ACCENT" stroke-width="2.5" fill="none" stroke-linecap="round"/>',
  settings:'<circle cx="33" cy="32" r="10" fill="DARK" stroke="ACCENT" stroke-width="3"/>',
  environment:'<path d="M15 31L22 16L31 31L24 27L21 31L18 28Z" fill="ACCENT"/><circle cx="47" cy="12" r="6" fill="ACCENT"/>',
  save:'<path d="M21 9H41V25H21Z" fill="DARK"/><path d="M19 37H45V54H19Z" fill="ACCENT"/><path d="M35 12V22" stroke="ACCENT" stroke-width="4"/>',
  trash:'<path d="M26 28V46M37 28V46" stroke="ACCENT" stroke-width="3" stroke-linecap="round"/>',
  mic:'<path d="M27 13V29" stroke="ACCENT" stroke-width="3" stroke-linecap="round"/>',
};
fs.mkdirSync(out,{recursive:true});
const icons={};
for(const [name,d] of Object.entries(shapes)){
  const accent=name==='trophy'?'#e6c38b':name==='sell'?'#e6a4a0':'#bce9d4';
  const detail=(details[name]||'').replaceAll('ACCENT',accent).replaceAll('DARK','#15282a').replaceAll('EDGE','#688d89');
  icons[name]=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" fill="none"><defs><linearGradient id="${name}-metal" x1="12" y1="8" x2="45" y2="54" gradientUnits="userSpaceOnUse"><stop stop-color="#c1d5d5"/><stop offset=".32" stop-color="#769d99"/><stop offset="1" stop-color="#355653"/></linearGradient></defs><ellipse cx="34" cy="58" rx="22" ry="3" fill="#000" opacity=".18"/><path d="${d}" transform="translate(2 3)" fill="#102725" stroke="#102725" stroke-width="1.5" stroke-linejoin="round"/><path d="${d}" fill="url(#${name}-metal)" stroke="#d2e5dd" stroke-opacity=".65" stroke-width=".8" stroke-linejoin="round"/>${detail}</svg>`;
  fs.writeFileSync(path.join(out,`${name}.svg`),icons[name]+'\n');
}
fs.writeFileSync(path.join(out,'manifest.json'),JSON.stringify({version:1,viewBox:'0 0 64 64',icons:Object.keys(icons)},null,2)+'\n');
if(process.argv[2]){
  const target=path.resolve(process.argv[2],'components/trenchstar');fs.mkdirSync(target,{recursive:true});
  fs.writeFileSync(path.join(target,'icons.json'),JSON.stringify(icons,null,2)+'\n');
}
console.log(`Generated ${Object.keys(icons).length} shared Trenchstar icons.`);
