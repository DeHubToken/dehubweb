// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title  DeHubWork
 * @notice On-chain escrow for the /work marketplace. Holds DHB or USDC for
 *         posted jobs and releases pro-rata to workers as the poster
 *         approves submissions. Admin (owner) resolves disputes.
 *
 * Job lifecycle:
 *   Open  → poster funds totalAmount (token transferred to contract)
 *   Open  → workers submitProof / applyToJob
 *   Open  → poster approveSubmission (releases pricePerUnit minus 5% fee)
 *           or awardApplicant (locks worker for contract jobs)
 *   Open  → openDispute → status = Disputed
 *   Disputed → owner.adminResolve(workerAmount, posterRefund)
 *   Open  → cancelJob (poster, only if no approvals/awards yet) → full refund
 */
contract DeHubWork is ReentrancyGuard, Ownable {
    using SafeERC20 for IERC20;

    enum JobType   { Shill, Clipping, Contract }
    enum JobStatus { None, Open, InProgress, Completed, Disputed, Cancelled }

    struct Job {
        address poster;
        address token;          // DHB or USDC
        uint256 pricePerUnit;
        uint256 maxUnits;
        uint256 unitsApproved;
        uint256 totalAmount;    // pricePerUnit * maxUnits at creation
        uint256 released;       // amount released to workers so far
        address awardedWorker;  // only for Contract type
        JobType jobType;
        JobStatus status;
        uint256 deadline;
    }

    uint256 public constant FEE_BPS = 500;          // 5%
    uint256 public constant BPS_DENOM = 10_000;

    address public feeRecipient;
    mapping(address => bool) public allowedToken;

    uint256 public nextJobId = 1;
    mapping(uint256 => Job) public jobs;

    // jobId => worker => approved units (for per-unit accounting)
    mapping(uint256 => mapping(address => uint256)) public approvedUnits;
    mapping(bytes32 => bool) public paidIntent;
    mapping(uint256 => mapping(bytes32 => address)) public proofWorkers;
    mapping(uint256 => mapping(bytes32 => bool)) public proofDecided;
    mapping(uint256 => uint256) public pendingProofs;
    mapping(uint256 => uint256) public registeredProofs;
    mapping(uint256 => uint256) public lastReviewAt;
    mapping(uint256 => mapping(address => bool)) public registeredWorkers;

    event JobCreated(uint256 indexed jobId, address indexed poster, address token, JobType jobType, uint256 totalAmount, uint256 pricePerUnit, uint256 maxUnits, uint256 deadline);
    event Awarded(uint256 indexed jobId, address indexed worker);
    event SubmissionApproved(uint256 indexed jobId, address indexed worker, uint256 amountToWorker, uint256 fee, bytes32 proofHash, bytes32 paymentId);
    event Disputed(uint256 indexed jobId, address indexed openedBy);
    event DisputeResolved(uint256 indexed jobId, address worker, uint256 workerAmount, uint256 posterRefund, bytes32 proofHash);
    event JobCancelled(uint256 indexed jobId);
    event ProofRegistered(uint256 indexed jobId, address indexed worker, bytes32 proofHash);
    event ProofRejected(uint256 indexed jobId, bytes32 proofHash);
    event JobClosed(uint256 indexed jobId, uint256 refund);

    constructor(address _owner, address _feeRecipient, address[] memory _tokens) Ownable(_owner) {
        require(_feeRecipient != address(0), "fee=0");
        feeRecipient = _feeRecipient;
        for (uint i = 0; i < _tokens.length; i++) allowedToken[_tokens[i]] = true;
    }

    function setAllowedToken(address token, bool ok) external onlyOwner { allowedToken[token] = ok; }
    function setFeeRecipient(address r) external onlyOwner { require(r != address(0), "0"); feeRecipient = r; }

    // ── Job creation (escrow funded in same tx via transferFrom) ────────
    function createJob(
        address token,
        JobType jobType,
        uint256 pricePerUnit,
        uint256 maxUnits,
        uint256 deadline
    ) external nonReentrant returns (uint256 jobId) {
        require(allowedToken[token], "token!");
        require(pricePerUnit > 0 && maxUnits > 0, "amt=0");
        require(deadline > block.timestamp, "deadline");
        require(jobType != JobType.Contract || maxUnits == 1, "contract units");

        uint256 total = pricePerUnit * maxUnits;
        uint256 beforeBalance = IERC20(token).balanceOf(address(this));
        IERC20(token).safeTransferFrom(msg.sender, address(this), total);
        require(IERC20(token).balanceOf(address(this)) - beforeBalance == total, "funding shortfall");

        jobId = nextJobId++;
        jobs[jobId] = Job({
            poster: msg.sender,
            token: token,
            pricePerUnit: pricePerUnit,
            maxUnits: maxUnits,
            unitsApproved: 0,
            totalAmount: total,
            released: 0,
            awardedWorker: address(0),
            jobType: jobType,
            status: JobStatus.Open,
            deadline: deadline
        });
        emit JobCreated(jobId, msg.sender, token, jobType, total, pricePerUnit, maxUnits, deadline);
    }

    // ── Contract jobs: poster awards a worker ────────────────────────────
    function awardApplicant(uint256 jobId, address worker) external {
        Job storage j = jobs[jobId];
        require(j.status == JobStatus.Open, "status");
        require(msg.sender == j.poster, "poster");
        require(j.jobType == JobType.Contract, "type");
        require(block.timestamp < j.deadline, "deadline");
        require(worker != address(0) && worker != j.poster, "worker");
        j.awardedWorker = worker;
        j.status = JobStatus.InProgress;
        emit Awarded(jobId, worker);
    }

    // ── Approve a worker's submission, release pro-rata payout ──────────
    function registerProof(uint256 jobId, bytes32 proofHash) external {
        Job storage j = jobs[jobId];
        require(j.status == JobStatus.Open || j.status == JobStatus.InProgress, "status");
        require(block.timestamp < j.deadline, "deadline");
        require(msg.sender != j.poster && proofHash != bytes32(0), "proof");
        require(j.jobType != JobType.Contract || msg.sender == j.awardedWorker, "worker");
        require(proofWorkers[jobId][proofHash] == address(0), "duplicate proof");
        require(pendingProofs[jobId] < j.maxUnits - j.unitsApproved, "review pending proofs first");
        proofWorkers[jobId][proofHash] = msg.sender;
        registeredWorkers[jobId][msg.sender] = true;
        pendingProofs[jobId]++;
        registeredProofs[jobId]++;
        emit ProofRegistered(jobId, msg.sender, proofHash);
    }

    function rejectProof(uint256 jobId, bytes32 proofHash) external {
        Job storage j = jobs[jobId];
        require(msg.sender == j.poster || msg.sender == owner(), "reviewer");
        require(j.status == JobStatus.Open || j.status == JobStatus.InProgress || (j.status == JobStatus.Disputed && msg.sender == owner()), "status");
        require(proofWorkers[jobId][proofHash] != address(0) && !proofDecided[jobId][proofHash], "proof");
        proofDecided[jobId][proofHash] = true;
        pendingProofs[jobId]--;
        lastReviewAt[jobId] = block.timestamp;
        emit ProofRejected(jobId, proofHash);
    }

    function approveSubmission(uint256 jobId, address worker, uint256 units, bytes32 proofHash, bytes32 paymentId) external nonReentrant {
        Job storage j = jobs[jobId];
        require(j.status == JobStatus.Open || j.status == JobStatus.InProgress || (j.status == JobStatus.Disputed && msg.sender == owner()), "status");
        require(msg.sender == j.poster || msg.sender == owner(), "reviewer");
        require(worker != address(0) && worker != j.poster, "worker");
        require(paymentId != bytes32(0) && !paidIntent[paymentId], "payment already settled");
        require(proofWorkers[jobId][proofHash] == worker && !proofDecided[jobId][proofHash], "proof");
        require(units > 0, "units=0");
        require(j.unitsApproved + units <= j.maxUnits, "exceeds");
        if (j.jobType == JobType.Contract) {
            require(worker == j.awardedWorker, "worker");
        }

        uint256 gross = j.pricePerUnit * units;
        uint256 fee = (gross * FEE_BPS) / BPS_DENOM;
        uint256 net = gross - fee;

        j.unitsApproved += units;
        j.released += gross;
        approvedUnits[jobId][worker] += units;
        paidIntent[paymentId] = true;
        proofDecided[jobId][proofHash] = true;
        pendingProofs[jobId]--;
        lastReviewAt[jobId] = block.timestamp;

        IERC20(j.token).safeTransfer(worker, net);
        IERC20(j.token).safeTransfer(feeRecipient, fee);

        if (j.unitsApproved == j.maxUnits && pendingProofs[jobId] == 0) j.status = JobStatus.Completed;
        emit SubmissionApproved(jobId, worker, net, fee, proofHash, paymentId);
    }

    function cancelJob(uint256 jobId) external nonReentrant {
        Job storage j = jobs[jobId];
        require(j.status == JobStatus.Open, "status");
        require(msg.sender == j.poster, "poster");
        require(j.unitsApproved == 0 && j.awardedWorker == address(0) && registeredProofs[jobId] == 0, "started");
        uint256 refund = j.totalAmount - j.released;
        j.status = JobStatus.Cancelled;
        IERC20(j.token).safeTransfer(j.poster, refund);
        emit JobCancelled(jobId);
    }

    function openDispute(uint256 jobId) external {
        Job storage j = jobs[jobId];
        require(j.status == JobStatus.Open || j.status == JobStatus.InProgress, "status");
        require(msg.sender == j.poster || msg.sender == j.awardedWorker || registeredWorkers[jobId][msg.sender], "party");
        j.status = JobStatus.Disputed;
        emit Disputed(jobId, msg.sender);
    }

    /// Admin-only dispute resolution. workerAmount + posterRefund must equal remaining balance.
    function adminResolve(uint256 jobId, address worker, uint256 workerAmount, uint256 posterRefund, bytes32 proofHash) external onlyOwner nonReentrant {
        Job storage j = jobs[jobId];
        require(j.status == JobStatus.Disputed, "status");
        uint256 remaining = j.totalAmount - j.released;
        require(workerAmount + posterRefund == remaining, "resolve full balance");
        require(pendingProofs[jobId] == 0 || (pendingProofs[jobId] == 1 && proofWorkers[jobId][proofHash] == worker && !proofDecided[jobId][proofHash]), "review other proofs first");
        if (workerAmount > 0) require(worker != address(0) && worker != j.poster && proofWorkers[jobId][proofHash] == worker, "worker");

        if (workerAmount > 0) {
            uint256 fee = (workerAmount * FEE_BPS) / BPS_DENOM;
            IERC20(j.token).safeTransfer(worker, workerAmount - fee);
            IERC20(j.token).safeTransfer(feeRecipient, fee);
        }
        if (posterRefund > 0) IERC20(j.token).safeTransfer(j.poster, posterRefund);

        j.released = j.totalAmount;
        if (pendingProofs[jobId] == 1) {
            proofDecided[jobId][proofHash] = true;
            pendingProofs[jobId] = 0;
        }
        j.status = JobStatus.Completed;
        emit DisputeResolved(jobId, worker, workerAmount, posterRefund, proofHash);
    }

    function closeJob(uint256 jobId) external nonReentrant {
        Job storage j = jobs[jobId];
        require(msg.sender == j.poster, "poster");
        require(j.status == JobStatus.Open || j.status == JobStatus.InProgress, "status");
        require(pendingProofs[jobId] == 0, "review pending proofs");
        require(block.timestamp >= j.deadline && block.timestamp >= lastReviewAt[jobId] + 3 days, "review window");
        uint256 refund = j.totalAmount - j.released;
        j.status = JobStatus.Completed;
        if (refund > 0) IERC20(j.token).safeTransfer(j.poster, refund);
        emit JobClosed(jobId, refund);
    }
}
