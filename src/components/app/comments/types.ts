/**
 * Comments Types
 * ==============
 * Type definitions for the comments system.
 */

export interface ApiComment {
  _id: string;
  address: string;
  username: string;
  comment: string;
  createdAt: string;
  avatarUrl?: string;
  replyToId?: string;
}

export interface Comment {
  id: string;
  address: string;
  username: string;
  avatarUrl?: string;
  text: string;
  timeAgo: string;
  replyToId?: string;
}

export interface CommentsSectionProps {
  tokenId: string;
  onClose: () => void;
}
