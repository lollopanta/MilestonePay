// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

contract MilestoneEscrow is ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint16 public constant BPS_DENOMINATOR = 10_000;
    uint64 public constant MAX_REVIEW_PERIOD = 365 days;

    enum DealStatus {
        Created,
        Active,
        Disputed,
        Completed,
        Cancelled
    }

    enum MilestoneStatus {
        Pending,
        Submitted,
        Disputed,
        Approved,
        Resolved
    }

    struct Milestone {
        uint256 amount;
        bytes32 evidenceHash;
        uint64 submittedAt;
        MilestoneStatus status;
    }

    struct Dispute {
        address openedBy;
        bytes32 clientEvidenceHash;
        bytes32 providerEvidenceHash;
        bool resolved;
        uint16 providerBps;
        uint256 providerAmount;
        uint256 clientRefundAmount;
    }

    error Unauthorized();
    error InvalidAddress();
    error ClientIsProvider();
    error ArbiterIsParticipant();
    error NoMilestones();
    error ZeroMilestoneAmount(uint256 milestoneId);
    error InvalidReviewPeriod(uint64 reviewPeriod);
    error InvalidState();
    error InvalidMilestone();
    error NotCurrentMilestone(uint256 expected, uint256 provided);
    error InvalidMilestoneState();
    error InvalidEvidenceHash();
    error EvidenceAlreadySubmitted();
    error InvalidProviderBps(uint16 providerBps);
    error ReviewPeriodActive(uint256 deadline);
    error ReviewPeriodElapsed(uint256 deadline);
    error CancellationAlreadyRequested();
    error NoCancellationRequest();
    error CancellationRequesterCannotAccept();
    error IncorrectFundingAmount(uint256 expected, uint256 received);

    event EscrowFunded(address indexed client, uint256 amount);
    event MilestoneSubmitted(uint256 indexed milestoneId, bytes32 evidenceHash, uint256 submittedAt);
    event MilestoneApproved(uint256 indexed milestoneId, uint256 amount);
    event FundsReleased(uint256 indexed milestoneId, address indexed provider, uint256 amount);
    event DisputeOpened(
        uint256 indexed milestoneId, address indexed openedBy, bytes32 clientEvidenceHash, bytes32 providerEvidenceHash
    );
    event DisputeEvidenceSubmitted(uint256 indexed milestoneId, address indexed submitter, bytes32 evidenceHash);
    event DisputeResolved(
        uint256 indexed milestoneId,
        uint16 providerBps,
        uint256 providerAmount,
        uint256 clientRefundAmount,
        bool terminateAgreement
    );
    event CancellationRequested(address indexed requester, uint256 indexed milestoneId);
    event CancellationRequestInvalidated(address indexed requester, uint256 indexed milestoneId);
    event AgreementCancelled(uint256 indexed milestoneId, uint256 refundedAmount);
    event ReviewTimeoutClaimed(uint256 indexed milestoneId, address indexed provider, uint256 amount);
    event DealCompleted();

    address public immutable client;
    address public immutable provider;
    address public immutable arbiter;
    IERC20 public immutable paymentToken;
    uint256 public immutable totalAmount;
    uint64 public immutable reviewPeriod;

    DealStatus public status;
    uint256 public totalReleased;
    uint256 public totalRefunded;
    uint256 public currentMilestone;
    address public cancellationRequester;

    Milestone[] private milestones;
    mapping(uint256 milestoneId => Dispute) private disputes;

    modifier onlyClient() {
        if (msg.sender != client) revert Unauthorized();
        _;
    }

    modifier onlyArbiter() {
        if (msg.sender != arbiter) revert Unauthorized();
        _;
    }

    modifier onlyParticipant() {
        if (msg.sender != client && msg.sender != provider) revert Unauthorized();
        _;
    }

    constructor(
        address client_,
        address provider_,
        address arbiter_,
        address paymentToken_,
        uint256[] memory milestoneAmounts,
        uint64 reviewPeriod_
    ) {
        if (client_ == address(0) || provider_ == address(0) || arbiter_ == address(0) || paymentToken_ == address(0)) {
            revert InvalidAddress();
        }
        if (client_ == provider_) revert ClientIsProvider();
        if (arbiter_ == client_ || arbiter_ == provider_) revert ArbiterIsParticipant();
        if (milestoneAmounts.length == 0) revert NoMilestones();
        if (reviewPeriod_ == 0 || reviewPeriod_ > MAX_REVIEW_PERIOD) revert InvalidReviewPeriod(reviewPeriod_);

        uint256 total;
        for (uint256 i; i < milestoneAmounts.length; ++i) {
            uint256 amount = milestoneAmounts[i];
            if (amount == 0) revert ZeroMilestoneAmount(i);
            total += amount;
            milestones.push(
                Milestone({amount: amount, evidenceHash: bytes32(0), submittedAt: 0, status: MilestoneStatus.Pending})
            );
        }

        client = client_;
        provider = provider_;
        arbiter = arbiter_;
        paymentToken = IERC20(paymentToken_);
        totalAmount = total;
        reviewPeriod = reviewPeriod_;
    }

    function milestoneCount() external view returns (uint256) {
        return milestones.length;
    }

    function getMilestone(uint256 milestoneId) external view returns (Milestone memory) {
        if (milestoneId >= milestones.length) revert InvalidMilestone();
        return milestones[milestoneId];
    }

    function getDispute(uint256 milestoneId) external view returns (Dispute memory) {
        if (milestoneId >= milestones.length) revert InvalidMilestone();
        return disputes[milestoneId];
    }

    function fund() external nonReentrant onlyClient {
        if (status != DealStatus.Created) revert InvalidState();

        uint256 balanceBefore = paymentToken.balanceOf(address(this));
        paymentToken.safeTransferFrom(client, address(this), totalAmount);
        uint256 received = paymentToken.balanceOf(address(this)) - balanceBefore;
        if (received != totalAmount) revert IncorrectFundingAmount(totalAmount, received);

        status = DealStatus.Active;
        emit EscrowFunded(client, totalAmount);
    }

    function submitMilestone(uint256 milestoneId, bytes32 evidenceHash) external {
        if (msg.sender != provider) revert Unauthorized();
        if (status != DealStatus.Active) revert InvalidState();
        if (evidenceHash == bytes32(0)) revert InvalidEvidenceHash();

        Milestone storage milestone = _current(milestoneId);
        if (milestone.status != MilestoneStatus.Pending) revert InvalidMilestoneState();

        _clearCancellationRequest(milestoneId);
        milestone.evidenceHash = evidenceHash;
        milestone.submittedAt = uint64(block.timestamp);
        milestone.status = MilestoneStatus.Submitted;
        emit MilestoneSubmitted(milestoneId, evidenceHash, block.timestamp);
    }

    function approveMilestone(uint256 milestoneId) external nonReentrant onlyClient {
        if (status != DealStatus.Active) revert InvalidState();

        Milestone storage milestone = _current(milestoneId);
        if (milestone.status != MilestoneStatus.Submitted) revert InvalidMilestoneState();

        _payProviderAndAdvance(milestoneId, milestone, false);
    }

    function openDispute(uint256 milestoneId, bytes32 evidenceHash) external onlyParticipant {
        if (status != DealStatus.Active) revert InvalidState();
        if (evidenceHash == bytes32(0)) revert InvalidEvidenceHash();

        Milestone storage milestone = _current(milestoneId);
        if (msg.sender == client) {
            if (milestone.status != MilestoneStatus.Pending && milestone.status != MilestoneStatus.Submitted) {
                revert InvalidMilestoneState();
            }
            if (
                milestone.status == MilestoneStatus.Submitted
                    && block.timestamp >= uint256(milestone.submittedAt) + reviewPeriod
            ) revert ReviewPeriodElapsed(uint256(milestone.submittedAt) + reviewPeriod);
            disputes[milestoneId].clientEvidenceHash = evidenceHash;
        } else {
            if (milestone.status != MilestoneStatus.Submitted) revert InvalidMilestoneState();
            disputes[milestoneId].providerEvidenceHash = evidenceHash;
        }

        Dispute storage dispute = disputes[milestoneId];
        dispute.openedBy = msg.sender;
        _clearCancellationRequest(milestoneId);
        milestone.status = MilestoneStatus.Disputed;
        status = DealStatus.Disputed;
        emit DisputeOpened(milestoneId, msg.sender, dispute.clientEvidenceHash, dispute.providerEvidenceHash);
    }

    function submitDisputeEvidence(uint256 milestoneId, bytes32 evidenceHash) external onlyParticipant {
        if (status != DealStatus.Disputed) revert InvalidState();
        if (evidenceHash == bytes32(0)) revert InvalidEvidenceHash();

        Milestone storage milestone = _current(milestoneId);
        if (milestone.status != MilestoneStatus.Disputed) revert InvalidMilestoneState();

        Dispute storage dispute = disputes[milestoneId];
        if (msg.sender == client) {
            if (dispute.clientEvidenceHash != bytes32(0)) revert EvidenceAlreadySubmitted();
            dispute.clientEvidenceHash = evidenceHash;
        } else {
            if (dispute.providerEvidenceHash != bytes32(0)) revert EvidenceAlreadySubmitted();
            dispute.providerEvidenceHash = evidenceHash;
        }
        emit DisputeEvidenceSubmitted(milestoneId, msg.sender, evidenceHash);
    }

    function resolveDispute(uint256 milestoneId, uint16 providerBps, bool terminateAgreement)
        external
        nonReentrant
        onlyArbiter
    {
        if (status != DealStatus.Disputed) revert InvalidState();
        if (providerBps > BPS_DENOMINATOR) revert InvalidProviderBps(providerBps);

        Milestone storage milestone = _current(milestoneId);
        if (milestone.status != MilestoneStatus.Disputed) revert InvalidMilestoneState();

        Dispute storage dispute = disputes[milestoneId];
        uint256 providerAmount = milestone.amount * providerBps / BPS_DENOMINATOR;
        uint256 clientAmount = milestone.amount - providerAmount;
        dispute.resolved = true;
        dispute.providerBps = providerBps;
        dispute.providerAmount = providerAmount;
        dispute.clientRefundAmount = clientAmount;
        milestone.status = MilestoneStatus.Resolved;
        totalReleased += providerAmount;
        totalRefunded += clientAmount;

        uint256 futureRefund;
        if (terminateAgreement) {
            futureRefund = _remainingAmount();
            totalRefunded += futureRefund;
            status = DealStatus.Cancelled;
        } else {
            _advanceAfterSettlement(milestoneId);
        }

        emit DisputeResolved(milestoneId, providerBps, providerAmount, clientAmount, terminateAgreement);
        if (terminateAgreement) emit AgreementCancelled(milestoneId, clientAmount + futureRefund);

        if (providerAmount != 0) paymentToken.safeTransfer(provider, providerAmount);
        uint256 clientPayout = clientAmount + futureRefund;
        if (clientPayout != 0) paymentToken.safeTransfer(client, clientPayout);
    }

    function requestCancellation() external onlyParticipant {
        if (status != DealStatus.Active) revert InvalidState();
        if (_current(currentMilestone).status != MilestoneStatus.Pending) revert InvalidMilestoneState();
        if (cancellationRequester != address(0)) revert CancellationAlreadyRequested();

        cancellationRequester = msg.sender;
        emit CancellationRequested(msg.sender, currentMilestone);
    }

    function acceptCancellation() external nonReentrant onlyParticipant {
        if (status != DealStatus.Active) revert InvalidState();
        if (_current(currentMilestone).status != MilestoneStatus.Pending) revert InvalidMilestoneState();
        if (cancellationRequester == address(0)) revert NoCancellationRequest();
        if (cancellationRequester == msg.sender) revert CancellationRequesterCannotAccept();

        uint256 refundAmount = _remainingAmount();
        cancellationRequester = address(0);
        totalRefunded += refundAmount;
        status = DealStatus.Cancelled;
        emit AgreementCancelled(currentMilestone, refundAmount);
        if (refundAmount != 0) paymentToken.safeTransfer(client, refundAmount);
    }

    function claimAfterReviewTimeout(uint256 milestoneId) external nonReentrant {
        if (msg.sender != provider) revert Unauthorized();
        if (status != DealStatus.Active) revert InvalidState();

        Milestone storage milestone = _current(milestoneId);
        if (milestone.status != MilestoneStatus.Submitted) revert InvalidMilestoneState();
        uint256 deadline = uint256(milestone.submittedAt) + reviewPeriod;
        if (block.timestamp < deadline) revert ReviewPeriodActive(deadline);

        _payProviderAndAdvance(milestoneId, milestone, true);
    }

    function _payProviderAndAdvance(uint256 milestoneId, Milestone storage milestone, bool timedOut) internal {
        uint256 amount = milestone.amount;
        milestone.status = MilestoneStatus.Approved;
        totalReleased += amount;
        _advanceAfterSettlement(milestoneId);

        emit MilestoneApproved(milestoneId, amount);
        emit FundsReleased(milestoneId, provider, amount);
        if (timedOut) emit ReviewTimeoutClaimed(milestoneId, provider, amount);
        paymentToken.safeTransfer(provider, amount);
    }

    function _advanceAfterSettlement(uint256 milestoneId) internal {
        if (milestoneId + 1 == milestones.length) {
            status = DealStatus.Completed;
            emit DealCompleted();
        } else {
            currentMilestone = milestoneId + 1;
            status = DealStatus.Active;
        }
    }

    function _current(uint256 milestoneId) internal view returns (Milestone storage milestone) {
        if (milestoneId >= milestones.length) revert InvalidMilestone();
        if (milestoneId != currentMilestone) revert NotCurrentMilestone(currentMilestone, milestoneId);
        return milestones[milestoneId];
    }

    function _remainingAmount() internal view returns (uint256) {
        return totalAmount - totalReleased - totalRefunded;
    }

    function _clearCancellationRequest(uint256 milestoneId) internal {
        address requester = cancellationRequester;
        if (requester == address(0)) return;
        cancellationRequester = address(0);
        emit CancellationRequestInvalidated(requester, milestoneId);
    }
}
