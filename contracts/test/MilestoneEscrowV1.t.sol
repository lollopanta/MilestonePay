// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {MilestoneEscrow} from "../src/MilestoneEscrow.sol";
import {MockUSDT} from "../src/testnet/MockUSDT.sol";

contract MilestoneEscrowV1Test is Test {
    uint256 internal constant FIRST = 3_000e6;
    uint256 internal constant SECOND = 3_000e6;
    uint256 internal constant THIRD = 4_000e6;
    uint256 internal constant TOTAL = FIRST + SECOND + THIRD;
    uint64 internal constant REVIEW_PERIOD = 7 days;

    address internal client = makeAddr("client");
    address internal provider = makeAddr("provider");
    address internal arbiter = makeAddr("arbiter");
    address internal stranger = makeAddr("stranger");
    MockUSDT internal token;
    MilestoneEscrow internal escrow;
    uint256[] internal amounts;

    function setUp() public {
        amounts.push(FIRST);
        amounts.push(SECOND);
        amounts.push(THIRD);
        token = new MockUSDT();
        escrow = new MilestoneEscrow(client, provider, arbiter, address(token), amounts, REVIEW_PERIOD);
        _fund(escrow, token, TOTAL);
    }

    function testClientCanDisputePendingAndProviderCannot() public {
        vm.prank(provider);
        vm.expectRevert(MilestoneEscrow.InvalidMilestoneState.selector);
        escrow.openDispute(0, keccak256("provider"));

        vm.prank(client);
        escrow.openDispute(0, keccak256("client"));

        MilestoneEscrow.Dispute memory dispute = escrow.getDispute(0);
        assertEq(dispute.openedBy, client);
        assertEq(dispute.clientEvidenceHash, keccak256("client"));
        assertEq(uint256(escrow.status()), uint256(MilestoneEscrow.DealStatus.Disputed));
        assertEq(uint256(escrow.getMilestone(0).status), uint256(MilestoneEscrow.MilestoneStatus.Disputed));
    }

    function testDisputeAccessAndEvidenceRules() public {
        vm.prank(stranger);
        vm.expectRevert(MilestoneEscrow.Unauthorized.selector);
        escrow.openDispute(0, keccak256("evidence"));
        vm.prank(client);
        vm.expectRevert(MilestoneEscrow.InvalidEvidenceHash.selector);
        escrow.openDispute(0, bytes32(0));
        vm.prank(client);
        vm.expectRevert(abi.encodeWithSelector(MilestoneEscrow.NotCurrentMilestone.selector, 0, 1));
        escrow.openDispute(1, keccak256("evidence"));
    }

    function testClientAndProviderCanDisputeSubmittedMilestone() public {
        _submit(escrow, 0);
        vm.prank(client);
        escrow.openDispute(0, keccak256("client"));
        assertEq(escrow.getDispute(0).clientEvidenceHash, keccak256("client"));

        (MilestoneEscrow providerEscrow,) = _newFunded(FIRST, SECOND, THIRD);
        _submit(providerEscrow, 0);
        vm.prank(provider);
        providerEscrow.openDispute(0, keccak256("provider"));
        assertEq(providerEscrow.getDispute(0).providerEvidenceHash, keccak256("provider"));
    }

    function testDisputedDealBlocksSettlementAndAcceptsOneEvidencePerSide() public {
        vm.prank(client);
        escrow.openDispute(0, keccak256("client"));

        vm.prank(provider);
        escrow.submitDisputeEvidence(0, keccak256("provider"));
        vm.prank(provider);
        vm.expectRevert(MilestoneEscrow.EvidenceAlreadySubmitted.selector);
        escrow.submitDisputeEvidence(0, keccak256("provider replacement"));
        vm.prank(client);
        vm.expectRevert(MilestoneEscrow.EvidenceAlreadySubmitted.selector);
        escrow.submitDisputeEvidence(0, keccak256("client replacement"));

        vm.prank(provider);
        vm.expectRevert(MilestoneEscrow.InvalidState.selector);
        escrow.submitMilestone(0, keccak256("delivery"));
        vm.prank(client);
        vm.expectRevert(MilestoneEscrow.InvalidState.selector);
        escrow.approveMilestone(0);
    }

    function testOnlyArbiterCanResolveAndBpsAreBounded() public {
        vm.prank(client);
        escrow.openDispute(0, keccak256("client"));
        vm.prank(provider);
        vm.expectRevert(MilestoneEscrow.Unauthorized.selector);
        escrow.resolveDispute(0, 5_000, false);
        vm.prank(arbiter);
        vm.expectRevert(abi.encodeWithSelector(MilestoneEscrow.InvalidProviderBps.selector, 10_001));
        escrow.resolveDispute(0, 10_001, false);
    }

    function testDisputeSplitAccountingAtStandardPercentages() public {
        _assertSplit(0);
        _assertSplit(3_000);
        _assertSplit(5_000);
        _assertSplit(7_000);
        _assertSplit(10_000);
    }

    function testResolutionContinuesWithNextMilestone() public {
        vm.prank(client);
        escrow.openDispute(0, keccak256("client"));
        vm.prank(arbiter);
        escrow.resolveDispute(0, 7_000, false);

        assertEq(escrow.currentMilestone(), 1);
        assertEq(uint256(escrow.status()), uint256(MilestoneEscrow.DealStatus.Active));
        assertEq(uint256(escrow.getMilestone(0).status), uint256(MilestoneEscrow.MilestoneStatus.Resolved));
        _submit(escrow, 1);
        vm.prank(client);
        escrow.approveMilestone(1);
        assertEq(escrow.currentMilestone(), 2);
        assertEq(token.balanceOf(provider), 5_100e6);
        assertEq(escrow.totalRefunded(), 900e6);
        _assertAccounting(escrow, token);
    }

    function testResolutionCannotBeRepeated() public {
        vm.prank(client);
        escrow.openDispute(0, keccak256("client"));
        vm.prank(arbiter);
        escrow.resolveDispute(0, 5_000, false);
        vm.prank(arbiter);
        vm.expectRevert(MilestoneEscrow.InvalidState.selector);
        escrow.resolveDispute(0, 5_000, false);
    }

    function testTerminationSettlesCurrentAndRefundsFutureMilestones() public {
        vm.prank(client);
        escrow.openDispute(0, keccak256("client"));
        vm.prank(arbiter);
        escrow.resolveDispute(0, 7_000, true);

        assertEq(uint256(escrow.status()), uint256(MilestoneEscrow.DealStatus.Cancelled));
        assertEq(token.balanceOf(provider), 2_100e6);
        assertEq(token.balanceOf(client), 7_900e6);
        assertEq(escrow.totalReleased(), 2_100e6);
        assertEq(escrow.totalRefunded(), 7_900e6);
        assertEq(token.balanceOf(address(escrow)), 0);
        _assertAccounting(escrow, token);
    }

    function testMutualCancellationRequiresBothParticipants() public {
        vm.prank(stranger);
        vm.expectRevert(MilestoneEscrow.Unauthorized.selector);
        escrow.requestCancellation();

        vm.prank(client);
        escrow.requestCancellation();
        assertEq(escrow.cancellationRequester(), client);
        assertEq(uint256(escrow.status()), uint256(MilestoneEscrow.DealStatus.Active));

        vm.prank(client);
        vm.expectRevert(MilestoneEscrow.CancellationRequesterCannotAccept.selector);
        escrow.acceptCancellation();
        vm.prank(stranger);
        vm.expectRevert(MilestoneEscrow.Unauthorized.selector);
        escrow.acceptCancellation();

        vm.prank(provider);
        escrow.acceptCancellation();
        assertEq(uint256(escrow.status()), uint256(MilestoneEscrow.DealStatus.Cancelled));
        assertEq(escrow.totalRefunded(), TOTAL);
        assertEq(token.balanceOf(address(escrow)), 0);
        _assertAccounting(escrow, token);
    }

    function testProviderCanRequestCancellationAndReleasedFundsAreNotClawedBack() public {
        _submit(escrow, 0);
        vm.prank(client);
        escrow.approveMilestone(0);

        vm.prank(provider);
        escrow.requestCancellation();
        vm.prank(client);
        escrow.acceptCancellation();

        assertEq(token.balanceOf(provider), FIRST);
        assertEq(token.balanceOf(client), SECOND + THIRD);
        assertEq(escrow.totalReleased(), FIRST);
        assertEq(escrow.totalRefunded(), SECOND + THIRD);
        _assertAccounting(escrow, token);
    }

    function testSubmissionInvalidatesStaleCancellationRequest() public {
        vm.prank(provider);
        escrow.requestCancellation();
        _submit(escrow, 0);
        assertEq(escrow.cancellationRequester(), address(0));

        vm.prank(client);
        vm.expectRevert(MilestoneEscrow.InvalidMilestoneState.selector);
        escrow.acceptCancellation();
    }

    function testReviewTimeoutPaysOnlyProviderAfterDeadline() public {
        _submit(escrow, 0);
        MilestoneEscrow.Milestone memory milestone = escrow.getMilestone(0);
        uint256 deadline = uint256(milestone.submittedAt) + REVIEW_PERIOD;

        vm.prank(client);
        vm.expectRevert(MilestoneEscrow.Unauthorized.selector);
        escrow.claimAfterReviewTimeout(0);
        vm.prank(provider);
        vm.expectRevert(abi.encodeWithSelector(MilestoneEscrow.ReviewPeriodActive.selector, deadline));
        escrow.claimAfterReviewTimeout(0);

        vm.warp(deadline);
        vm.prank(client);
        vm.expectRevert(abi.encodeWithSelector(MilestoneEscrow.ReviewPeriodElapsed.selector, deadline));
        escrow.openDispute(0, keccak256("late client evidence"));
        vm.prank(provider);
        escrow.claimAfterReviewTimeout(0);

        assertEq(token.balanceOf(provider), FIRST);
        assertEq(escrow.currentMilestone(), 1);
        assertEq(uint256(escrow.getMilestone(0).status), uint256(MilestoneEscrow.MilestoneStatus.Approved));
        _assertAccounting(escrow, token);
    }

    function testFuzzDisputeSettlementAccounting(
        uint256 first,
        uint256 second,
        uint256 third,
        uint16 providerBps,
        bool terminateAgreement
    ) public {
        first = bound(first, 1, 1_000_000e6);
        second = bound(second, 1, 1_000_000e6);
        third = bound(third, 1, 1_000_000e6);
        providerBps = uint16(bound(providerBps, 0, 10_000));
        (MilestoneEscrow fuzzEscrow, MockUSDT fuzzToken) = _newFunded(first, second, third);

        vm.prank(client);
        fuzzEscrow.openDispute(0, keccak256("client"));
        vm.prank(arbiter);
        fuzzEscrow.resolveDispute(0, providerBps, terminateAgreement);
        _assertAccounting(fuzzEscrow, fuzzToken);
        assertLe(fuzzEscrow.totalReleased() + fuzzEscrow.totalRefunded(), fuzzEscrow.totalAmount());

        if (terminateAgreement) {
            assertEq(uint256(fuzzEscrow.status()), uint256(MilestoneEscrow.DealStatus.Cancelled));
            assertEq(fuzzToken.balanceOf(address(fuzzEscrow)), 0);
        } else {
            _submit(fuzzEscrow, 1);
            vm.prank(client);
            fuzzEscrow.approveMilestone(1);
            _submit(fuzzEscrow, 2);
            vm.prank(client);
            fuzzEscrow.approveMilestone(2);
            assertEq(uint256(fuzzEscrow.status()), uint256(MilestoneEscrow.DealStatus.Completed));
            assertEq(fuzzToken.balanceOf(address(fuzzEscrow)), 0);
            _assertAccounting(fuzzEscrow, fuzzToken);
        }
    }

    function testFuzzCancellationAfterCompletedMilestones(uint8 completed) public {
        completed = uint8(bound(completed, 0, 2));
        for (uint256 i; i < completed; ++i) {
            _submit(escrow, i);
            vm.prank(client);
            escrow.approveMilestone(i);
        }

        vm.prank(client);
        escrow.requestCancellation();
        vm.prank(provider);
        escrow.acceptCancellation();

        assertEq(uint256(escrow.status()), uint256(MilestoneEscrow.DealStatus.Cancelled));
        assertEq(token.balanceOf(address(escrow)), 0);
        _assertAccounting(escrow, token);
    }

    function _assertSplit(uint16 providerBps) internal {
        (MilestoneEscrow splitEscrow, MockUSDT splitToken) = _newFunded(FIRST, SECOND, THIRD);
        vm.prank(client);
        splitEscrow.openDispute(0, keccak256(abi.encode("client", providerBps)));
        vm.prank(arbiter);
        splitEscrow.resolveDispute(0, providerBps, false);

        uint256 providerAmount = FIRST * providerBps / 10_000;
        uint256 clientAmount = FIRST - providerAmount;
        assertEq(splitToken.balanceOf(provider), providerAmount);
        assertEq(splitToken.balanceOf(client), clientAmount);
        assertEq(splitEscrow.totalReleased(), providerAmount);
        assertEq(splitEscrow.totalRefunded(), clientAmount);
        assertEq(splitEscrow.currentMilestone(), 1);
        _assertAccounting(splitEscrow, splitToken);
    }

    function _newFunded(uint256 first, uint256 second, uint256 third)
        internal
        returns (MilestoneEscrow created, MockUSDT createdToken)
    {
        uint256[] memory values = new uint256[](3);
        values[0] = first;
        values[1] = second;
        values[2] = third;
        createdToken = new MockUSDT();
        created = new MilestoneEscrow(client, provider, arbiter, address(createdToken), values, REVIEW_PERIOD);
        _fund(created, createdToken, first + second + third);
    }

    function _fund(MilestoneEscrow target, MockUSDT paymentToken, uint256 amount) internal {
        paymentToken.mint(client, amount);
        vm.startPrank(client);
        paymentToken.approve(address(target), amount);
        target.fund();
        vm.stopPrank();
    }

    function _submit(MilestoneEscrow target, uint256 milestoneId) internal {
        vm.prank(provider);
        target.submitMilestone(milestoneId, keccak256(abi.encode("evidence", milestoneId)));
    }

    function _assertAccounting(MilestoneEscrow target, MockUSDT paymentToken) internal view {
        assertEq(
            paymentToken.balanceOf(address(target)) + target.totalReleased() + target.totalRefunded(),
            target.totalAmount()
        );
    }
}
