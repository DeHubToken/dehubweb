
import DOMPurify from 'dompurify';

export const createSanitizedHtml = (htmlString: string) => {
  const sanitized = DOMPurify.sanitize(htmlString, {
    USE_PROFILES: {
      html: true
    },
    ADD_ATTR: ['target']
  });
  return {
    __html: sanitized
  };
};

export const processLineForHtml = (lineContent: string) => {
  return lineContent
    .replace(/\*\*(.*?)\*\*/g, '<strong class="font-semibold text-royal-blue">$1</strong>')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer" class="text-middle-blue hover:text-royal-blue underline transition-colors duration-200">$1</a>');
};
