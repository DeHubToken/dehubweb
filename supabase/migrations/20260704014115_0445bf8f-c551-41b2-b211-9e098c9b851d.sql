UPDATE public.feature_requests SET status='shipped' WHERE id IN (
  '1e705152-a0d1-4108-be82-4cd67486f246', -- Events
  '02b5ed27-3968-40c0-95d9-0f500917af51', -- Add music over image/video uploads
  'd0112d07-fe7a-49cb-8a76-da61ed6e2c7d', -- Endpoint to track tips per post
  '6aaad58a-551f-4e8c-ab1b-e04fe6a20c75', -- Fix @ mention system
  'cd72e997-fded-4405-a968-a4a8c9b8a57c', -- Mobile cashtags tappable
  '5092d0ef-ac9e-4cc1-a6a3-38cf1e43d4ee', -- Can't reply to replies
  '396d8d94-eb88-4652-9b69-4b4397422419', -- Poll posts with multiple choice voting
  'c1b723ed-e2f1-4987-8e6e-d70f6893b2af', -- Following/subscribed feed on mobile
  '5c6271e9-e5e8-453c-86ac-9fe3f3d94fb0', -- Full wallet like DeHub wallet on web
  '4cc386b2-6c3f-45b7-9afb-81efab796d08', -- Chat @ mentions dropdown
  'fcdf26d4-568a-47f8-b9c6-7a3a13824f98', -- Fiat gateway notification
  '6c812f0b-f730-4757-9776-dc290c0d55dd', -- Fractions page functional
  'b8438b2c-b08d-461a-8bfb-4aa2e468a815', -- Optimise tx confirmation UX
  '2c7bac15-8d9f-4ce3-928d-f0264d2834e9', -- Payment flow for AI image/video
  '0eb0a0de-41e3-4ac3-afdb-eb44b6e795b8', -- Tips/PPV notifications in Command Centre
  '01ed251f-ce9e-4df9-a8f4-8ef65b030456', -- View counter for comments and replies
  '2e40826e-1d30-48df-b833-125e6c437dbd', -- See schedule of ALL scheduled posts
  '915291a7-c70f-482e-b79a-3ad1cb1bfc1d', -- Basic algorithm for home feed
  'c441f643-82a0-46a9-8a01-f48fafea84de', -- Gate NFT projects content
  '9ec2d5a5-34fb-4bf6-b002-ba8356fa7a62', -- Pull down to refresh on mobile
  'bbba8ea6-99ae-4282-a3aa-05e5864c13a4', -- Voice and video calls in messages
  '2a0219e7-86ae-4aa8-87a6-8ee7afa9f73a', -- Full i18n translation
  'c17b1787-0e08-488e-9032-cb9d3c84c312', -- Copy AI agent system for assistant tab
  '033b86ff-8b8b-488b-8c3d-6cc7d8432f0d', -- Any token gated uploads on Base/BNB
  '92781ec3-065f-4cc3-aee7-02f57f124160'  -- Share image as post screenshot for text posts
);