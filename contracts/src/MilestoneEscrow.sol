// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

contract MilestoneEscrow is ReentrancyGuard {
    using SafeERC20 for IERC20;

    enum DealStatus {
        Created,
        Active,
        Completed
    }
    enum MilestoneStatus {
        Pending,
        Submitted,
        Approved
    }

    struct Milestone {
        uint256 amount;
        bytes32 evidenceHash;
        MilestoneStatus status;
    }

    error Unauthorized();
    error InvalidAddress();
    error ClientIsProvider();
    error NoMilestones();
    error ZeroMilestoneAmount(uint256 milestoneId);
    error InvalidState();
    error InvalidMilestone();
    error InvalidMilestoneState();
    error InvalidEvidenceHash();
    error IncorrectFundingAmount(uint256 expected, uint256 received);

    event EscrowFunded(address indexed client, uint256 amount);
    event MilestoneSubmitted(uint256 indexed milestoneId, bytes32 evidenceHash);
    event MilestoneApproved(uint256 indexed milestoneId, uint256 amount);
    event FundsReleased(uint256 indexed milestoneId, address indexed provider, uint256 amount);
    event DealCompleted();

    address public immutable client;
    address public immutable provider;
    address public immutable arbiter;
    IERC20 public immutable paymentToken;
    uint256 public immutable totalAmount;

    DealStatus public status;
    uint256 public totalReleased;
    Milestone[] private milestones;

    modifier onlyClient() {
        if (msg.sender != client) revert Unauthorized();
        _;
    }

    constructor(
        address client_,
        address provider_,
        address arbiter_,
        address paymentToken_,
        uint256[] memory milestoneAmounts
    ) {
        if (client_ == address(0) || provider_ == address(0) || arbiter_ == address(0) || paymentToken_ == address(0)) {
            revert InvalidAddress();
        }
        if (client_ == provider_) revert ClientIsProvider();
        if (milestoneAmounts.length == 0) revert NoMilestones();

        uint256 total;
        for (uint256 i; i < milestoneAmounts.length; ++i) {
            uint256 amount = milestoneAmounts[i];
            if (amount == 0) revert ZeroMilestoneAmount(i);
            total += amount;
            milestones.push(Milestone({amount: amount, evidenceHash: bytes32(0), status: MilestoneStatus.Pending}));
        }

        client = client_;
        provider = provider_;
        arbiter = arbiter_;
        paymentToken = IERC20(paymentToken_);
        totalAmount = total;
    }

    function milestoneCount() external view returns (uint256) {
        return milestones.length;
    }

    function getMilestone(uint256 milestoneId) external view returns (Milestone memory) {
        if (milestoneId >= milestones.length) revert InvalidMilestone();
        return milestones[milestoneId];
    }

    function fund() external onlyClient nonReentrant {
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
        if (milestoneId >= milestones.length) revert InvalidMilestone();
        if (evidenceHash == bytes32(0)) revert InvalidEvidenceHash();

        Milestone storage milestone = milestones[milestoneId];
        if (milestone.status != MilestoneStatus.Pending) revert InvalidMilestoneState();

        milestone.evidenceHash = evidenceHash;
        milestone.status = MilestoneStatus.Submitted;
        emit MilestoneSubmitted(milestoneId, evidenceHash);
    }

    function approveMilestone(uint256 milestoneId) external onlyClient nonReentrant {
        if (status != DealStatus.Active) revert InvalidState();
        if (milestoneId >= milestones.length) revert InvalidMilestone();

        Milestone storage milestone = milestones[milestoneId];
        if (milestone.status != MilestoneStatus.Submitted) revert InvalidMilestoneState();

        uint256 amount = milestone.amount;
        milestone.status = MilestoneStatus.Approved;
        totalReleased += amount;
        if (totalReleased == totalAmount) status = DealStatus.Completed;

        emit MilestoneApproved(milestoneId, amount);
        emit FundsReleased(milestoneId, provider, amount);
        if (status == DealStatus.Completed) emit DealCompleted();

        paymentToken.safeTransfer(provider, amount);
    }
}
