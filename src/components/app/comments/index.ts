/**
 * Comments Module
 * ===============
 * Exports for the comments system.
 * 
 * Note: This module previously contained CommentsSheet, CommentItem, and CommentInput.
 * These have been consolidated into CommentsSection in the cards folder.
 * This folder is kept for backwards compatibility but the main comments component
 * is now src/components/app/cards/CommentsSection.tsx
 */

// Re-export the main CommentsSection from cards for any imports that still reference this folder
export { CommentsSection } from '../cards/CommentsSection';
