
DROP TRIGGER IF EXISTS on_feature_request_vote_notify ON public.feature_request_votes;
CREATE TRIGGER on_feature_request_vote_notify
  AFTER INSERT ON public.feature_request_votes
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_feature_request_vote();

DROP TRIGGER IF EXISTS on_feature_request_comment_count ON public.feature_request_comments;
CREATE TRIGGER on_feature_request_comment_count
  AFTER INSERT OR DELETE ON public.feature_request_comments
  FOR EACH ROW
  EXECUTE FUNCTION public.update_feature_request_comment_count();

DROP TRIGGER IF EXISTS on_feature_request_comment_notify ON public.feature_request_comments;
CREATE TRIGGER on_feature_request_comment_notify
  AFTER INSERT ON public.feature_request_comments
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_feature_request_comment();

DROP TRIGGER IF EXISTS on_governance_vote_change ON public.governance_votes;
CREATE TRIGGER on_governance_vote_change
  AFTER INSERT OR UPDATE OR DELETE ON public.governance_votes
  FOR EACH ROW
  EXECUTE FUNCTION public.update_governance_vote_count();

DROP TRIGGER IF EXISTS on_governance_comment_count ON public.governance_comments;
CREATE TRIGGER on_governance_comment_count
  AFTER INSERT OR DELETE ON public.governance_comments
  FOR EACH ROW
  EXECUTE FUNCTION public.update_governance_comment_count();

DROP TRIGGER IF EXISTS on_governance_vote_notify ON public.governance_votes;
CREATE TRIGGER on_governance_vote_notify
  AFTER INSERT ON public.governance_votes
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_governance_vote();

DROP TRIGGER IF EXISTS on_governance_comment_notify ON public.governance_comments;
CREATE TRIGGER on_governance_comment_notify
  AFTER INSERT ON public.governance_comments
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_governance_comment();
