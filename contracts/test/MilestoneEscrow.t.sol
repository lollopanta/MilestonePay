// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {MilestoneEscrow} from "../src/MilestoneEscrow.sol";
import {EscrowFactory} from "../src/EscrowFactory.sol";
import {MockUSDT} from "../src/testnet/MockUSDT.sol";
import {FeeToken} from "./mocks/FeeToken.sol";

contract MilestoneEscrowTest is Test {
    uint256 internal constant TOTAL = 10_000e6;
    uint64 internal constant REVIEW_PERIOD = 7 days;
    event EscrowFunded(address indexed client, uint256 amount);
    event MilestoneSubmitted(uint256 indexed milestoneId, bytes32 evidenceHash, uint256 submittedAt);
    event MilestoneApproved(uint256 indexed milestoneId, uint256 amount);
    event FundsReleased(uint256 indexed milestoneId, address indexed provider, uint256 amount);
    event DealCompleted();
    event EscrowCreated(
        address indexed escrow,
        address indexed client,
        address indexed provider,
        address arbiter,
        address paymentToken,
        uint64 reviewPeriod
    );

    address internal client = makeAddr("client");
    address internal provider = makeAddr("provider");
    address internal arbiter = makeAddr("arbiter");
    address internal stranger = makeAddr("stranger");
    MockUSDT internal token;
    MilestoneEscrow internal escrow;
    EscrowFactory internal factory;
    uint256[] internal amounts;

    function setUp() public {
        token = new MockUSDT();
        factory = new EscrowFactory();
        amounts.push(3_000e6);
        amounts.push(3_000e6);
        amounts.push(4_000e6);
        escrow = new MilestoneEscrow(client, provider, arbiter, address(token), amounts, REVIEW_PERIOD);
        token.mint(client, TOTAL);
    }

    function testCreationStoresAgreementAndMilestones() public view {
        assertEq(escrow.client(), client);
        assertEq(escrow.provider(), provider);
        assertEq(escrow.arbiter(), arbiter);
        assertEq(address(escrow.paymentToken()), address(token));
        assertEq(escrow.totalAmount(), 10_000e6);
        assertEq(escrow.milestoneCount(), 3);
        assertEq(uint256(escrow.status()), uint256(MilestoneEscrow.DealStatus.Created));
        assertEq(escrow.currentMilestone(), 0);
        MilestoneEscrow.Milestone memory milestone = escrow.getMilestone(2);
        assertEq(milestone.amount, 4_000e6);
        assertEq(milestone.evidenceHash, bytes32(0));
        assertEq(uint256(milestone.status), uint256(MilestoneEscrow.MilestoneStatus.Pending));
    }

    function testConstructorRejectsZeroAddresses() public {
        vm.expectRevert(MilestoneEscrow.InvalidAddress.selector);
        new MilestoneEscrow(address(0), provider, arbiter, address(token), amounts, REVIEW_PERIOD);
        vm.expectRevert(MilestoneEscrow.InvalidAddress.selector);
        new MilestoneEscrow(client, address(0), arbiter, address(token), amounts, REVIEW_PERIOD);
        vm.expectRevert(MilestoneEscrow.InvalidAddress.selector);
        new MilestoneEscrow(client, provider, address(0), address(token), amounts, REVIEW_PERIOD);
        vm.expectRevert(MilestoneEscrow.InvalidAddress.selector);
        new MilestoneEscrow(client, provider, arbiter, address(0), amounts, REVIEW_PERIOD);
    }

    function testConstructorRejectsClientAsProvider() public {
        vm.expectRevert(MilestoneEscrow.ClientIsProvider.selector);
        new MilestoneEscrow(client, client, arbiter, address(token), amounts, REVIEW_PERIOD);
    }

    function testConstructorRejectsArbiterAsParticipant() public {
        vm.expectRevert(MilestoneEscrow.ArbiterIsParticipant.selector);
        new MilestoneEscrow(client, provider, client, address(token), amounts, REVIEW_PERIOD);
        vm.expectRevert(MilestoneEscrow.ArbiterIsParticipant.selector);
        new MilestoneEscrow(client, provider, provider, address(token), amounts, REVIEW_PERIOD);
    }

    function testConstructorRejectsNoMilestones() public {
        uint256[] memory empty = new uint256[](0);
        vm.expectRevert(MilestoneEscrow.NoMilestones.selector);
        new MilestoneEscrow(client, provider, arbiter, address(token), empty, REVIEW_PERIOD);
    }

    function testConstructorRejectsInvalidReviewPeriod() public {
        vm.expectRevert(abi.encodeWithSelector(MilestoneEscrow.InvalidReviewPeriod.selector, 0));
        new MilestoneEscrow(client, provider, arbiter, address(token), amounts, 0);
        vm.expectRevert(abi.encodeWithSelector(MilestoneEscrow.InvalidReviewPeriod.selector, uint64(365 days + 1)));
        new MilestoneEscrow(client, provider, arbiter, address(token), amounts, uint64(365 days + 1));
    }

    function testConstructorRejectsZeroMilestone() public {
        uint256[] memory invalid = new uint256[](2);
        invalid[0] = 1;
        vm.expectRevert(abi.encodeWithSelector(MilestoneEscrow.ZeroMilestoneAmount.selector, 1));
        new MilestoneEscrow(client, provider, arbiter, address(token), invalid, REVIEW_PERIOD);
    }

    function testOnlyClientCanFund() public {
        vm.prank(provider);
        vm.expectRevert(MilestoneEscrow.Unauthorized.selector);
        escrow.fund();
    }

    function testFundingRequiresFullAllowanceAndCannotBePartial() public {
        vm.prank(client);
        token.approve(address(escrow), TOTAL - 1);
        vm.prank(client);
        vm.expectRevert();
        escrow.fund();
        assertEq(token.balanceOf(address(escrow)), 0);
        assertEq(escrow.totalReleased(), 0);
        assertEq(uint256(escrow.status()), uint256(MilestoneEscrow.DealStatus.Created));
    }

    function testFundingMovesEntireAgreementOnce() public {
        _approveAndFund();
        assertEq(token.balanceOf(client), 0);
        assertEq(token.balanceOf(address(escrow)), 10_000e6);
        assertEq(uint256(escrow.status()), uint256(MilestoneEscrow.DealStatus.Active));

        vm.prank(client);
        vm.expectRevert(MilestoneEscrow.InvalidState.selector);
        escrow.fund();
    }

    function testFundingEmitsEvent() public {
        vm.prank(client);
        token.approve(address(escrow), TOTAL);
        vm.expectEmit(true, false, false, true, address(escrow));
        emit EscrowFunded(client, 10_000e6);
        vm.prank(client);
        escrow.fund();
    }

    function testRejectsFeeOnTransferToken() public {
        FeeToken feeToken = new FeeToken();
        MilestoneEscrow feeEscrow =
            new MilestoneEscrow(client, provider, arbiter, address(feeToken), amounts, REVIEW_PERIOD);
        uint256 total = feeEscrow.totalAmount();
        feeToken.mint(client, total);
        vm.prank(client);
        feeToken.approve(address(feeEscrow), total);
        vm.prank(client);
        vm.expectRevert(abi.encodeWithSelector(MilestoneEscrow.IncorrectFundingAmount.selector, total, total - 1));
        feeEscrow.fund();
        assertEq(feeToken.balanceOf(address(feeEscrow)), 0);
    }

    function testDoesNotAcceptNativeAvax() public {
        vm.deal(client, 1 ether);
        vm.prank(client);
        (bool success,) = address(escrow).call{value: 1 ether}("");
        assertFalse(success);
    }

    function testProviderCannotWithdrawArbitraryFunds() public {
        _approveAndFund();
        vm.prank(provider);
        (bool success,) = address(escrow).call(abi.encodeWithSignature("withdraw(uint256)", 1));
        assertFalse(success);
        assertEq(token.balanceOf(address(escrow)), 10_000e6);
    }

    function testOnlyProviderCanSubmit() public {
        _approveAndFund();
        vm.prank(client);
        vm.expectRevert(MilestoneEscrow.Unauthorized.selector);
        escrow.submitMilestone(0, keccak256("evidence"));
    }

    function testSubmitRequiresActiveDeal() public {
        vm.prank(provider);
        vm.expectRevert(MilestoneEscrow.InvalidState.selector);
        escrow.submitMilestone(0, keccak256("evidence"));
    }

    function testCannotSubmitNonexistentMilestone() public {
        _approveAndFund();
        vm.prank(provider);
        vm.expectRevert(MilestoneEscrow.InvalidMilestone.selector);
        escrow.submitMilestone(3, keccak256("evidence"));
    }

    function testCannotSubmitFutureMilestone() public {
        _approveAndFund();
        vm.prank(provider);
        vm.expectRevert(abi.encodeWithSelector(MilestoneEscrow.NotCurrentMilestone.selector, 0, 1));
        escrow.submitMilestone(1, keccak256("evidence"));
    }

    function testCannotReadNonexistentMilestone() public {
        vm.expectRevert(MilestoneEscrow.InvalidMilestone.selector);
        escrow.getMilestone(3);
    }

    function testCannotSubmitZeroEvidenceHash() public {
        _approveAndFund();
        vm.prank(provider);
        vm.expectRevert(MilestoneEscrow.InvalidEvidenceHash.selector);
        escrow.submitMilestone(0, bytes32(0));
    }

    function testPendingMilestoneBecomesSubmittedOnce() public {
        _approveAndFund();
        bytes32 evidence = keccak256("evidence");
        vm.expectEmit(true, false, false, true, address(escrow));
        emit MilestoneSubmitted(0, evidence, block.timestamp);
        vm.prank(provider);
        escrow.submitMilestone(0, evidence);

        MilestoneEscrow.Milestone memory milestone = escrow.getMilestone(0);
        assertEq(milestone.evidenceHash, evidence);
        assertEq(uint256(milestone.status), uint256(MilestoneEscrow.MilestoneStatus.Submitted));

        vm.prank(provider);
        vm.expectRevert(MilestoneEscrow.InvalidMilestoneState.selector);
        escrow.submitMilestone(0, evidence);
    }

    function testOnlyClientCanApprove() public {
        _submit(0);
        vm.prank(provider);
        vm.expectRevert(MilestoneEscrow.Unauthorized.selector);
        escrow.approveMilestone(0);
    }

    function testCannotApprovePendingOrNonexistentMilestone() public {
        _approveAndFund();
        vm.prank(client);
        vm.expectRevert(MilestoneEscrow.InvalidMilestoneState.selector);
        escrow.approveMilestone(0);
        vm.prank(client);
        vm.expectRevert(MilestoneEscrow.InvalidMilestone.selector);
        escrow.approveMilestone(3);
    }

    function testCannotApproveFutureMilestone() public {
        _approveAndFund();
        vm.prank(client);
        vm.expectRevert(abi.encodeWithSelector(MilestoneEscrow.NotCurrentMilestone.selector, 0, 1));
        escrow.approveMilestone(1);
    }

    function testApprovalReleasesExactAmountOnceAndKeepsRemainder() public {
        _submit(0);
        vm.expectEmit(true, false, false, true, address(escrow));
        emit MilestoneApproved(0, 3_000e6);
        vm.expectEmit(true, true, false, true, address(escrow));
        emit FundsReleased(0, provider, 3_000e6);
        vm.prank(client);
        escrow.approveMilestone(0);

        assertEq(token.balanceOf(provider), 3_000e6);
        assertEq(token.balanceOf(address(escrow)), 7_000e6);
        assertEq(escrow.totalReleased(), 3_000e6);
        assertEq(escrow.totalRefunded(), 0);
        assertEq(
            token.balanceOf(address(escrow)) + escrow.totalReleased() + escrow.totalRefunded(), escrow.totalAmount()
        );
        assertEq(uint256(escrow.status()), uint256(MilestoneEscrow.DealStatus.Active));
        assertEq(escrow.currentMilestone(), 1);

        vm.prank(client);
        vm.expectRevert(abi.encodeWithSelector(MilestoneEscrow.NotCurrentMilestone.selector, 1, 0));
        escrow.approveMilestone(0);
    }

    function testAllMilestonesCompleteAgreement() public {
        _approveAndFund();
        for (uint256 i; i < amounts.length; ++i) {
            vm.prank(provider);
            escrow.submitMilestone(i, keccak256(abi.encode("evidence", i)));
            if (i == amounts.length - 1) {
                vm.expectEmit(false, false, false, true, address(escrow));
                emit DealCompleted();
            }
            vm.prank(client);
            escrow.approveMilestone(i);
            assertLe(escrow.totalReleased(), escrow.totalAmount());
            assertEq(
                token.balanceOf(address(escrow)) + escrow.totalReleased() + escrow.totalRefunded(), escrow.totalAmount()
            );
            if (i < amounts.length - 1) {
                assertEq(uint256(escrow.status()), uint256(MilestoneEscrow.DealStatus.Active));
                assertEq(escrow.currentMilestone(), i + 1);
            }
        }

        assertEq(token.balanceOf(provider), 10_000e6);
        assertEq(token.balanceOf(address(escrow)), 0);
        assertEq(escrow.totalReleased(), escrow.totalAmount());
        assertEq(uint256(escrow.status()), uint256(MilestoneEscrow.DealStatus.Completed));
        assertEq(escrow.currentMilestone(), amounts.length - 1);
    }

    function testCompletedEscrowCannotBeFundedOrResubmitted() public {
        _completeAgreement();
        vm.prank(client);
        vm.expectRevert(MilestoneEscrow.InvalidState.selector);
        escrow.fund();
        vm.prank(provider);
        vm.expectRevert(MilestoneEscrow.InvalidState.selector);
        escrow.submitMilestone(0, keccak256("new evidence"));
    }

    function testFactoryUsesCallerAsClientAndRegistersEscrow() public {
        vm.prank(client);
        address created = factory.createEscrow(provider, arbiter, address(token), amounts, REVIEW_PERIOD);
        assertEq(MilestoneEscrow(created).client(), client);
        assertTrue(factory.isEscrow(created));
        assertFalse(factory.isEscrow(stranger));
    }

    function testFactoryEmitsCreationEvent() public {
        address predicted = vm.computeCreateAddress(address(factory), vm.getNonce(address(factory)));
        vm.expectEmit(true, true, true, true, address(factory));
        emit EscrowCreated(predicted, client, provider, arbiter, address(token), REVIEW_PERIOD);
        vm.prank(client);
        address created = factory.createEscrow(provider, arbiter, address(token), amounts, REVIEW_PERIOD);
        assertEq(created, predicted);
    }

    function testFactoryCreatesIndependentEscrows() public {
        vm.startPrank(client);
        address first = factory.createEscrow(provider, arbiter, address(token), amounts, REVIEW_PERIOD);
        address second = factory.createEscrow(provider, arbiter, address(token), amounts, REVIEW_PERIOD);
        vm.stopPrank();
        assertNotEq(first, second);
        assertTrue(factory.isEscrow(first));
        assertTrue(factory.isEscrow(second));
    }

    function testFuzzAccountingLifecycle(uint256 first, uint256 second, uint256 third) public {
        first = bound(first, 1, 1_000_000e6);
        second = bound(second, 1, 1_000_000e6);
        third = bound(third, 1, 1_000_000e6);
        uint256[] memory fuzzAmounts = new uint256[](3);
        fuzzAmounts[0] = first;
        fuzzAmounts[1] = second;
        fuzzAmounts[2] = third;
        uint256 total = first + second + third;
        MilestoneEscrow fuzzEscrow =
            new MilestoneEscrow(client, provider, arbiter, address(token), fuzzAmounts, REVIEW_PERIOD);
        assertEq(fuzzEscrow.totalAmount(), total);
        assertEq(token.balanceOf(address(fuzzEscrow)), 0);
        assertEq(fuzzEscrow.totalReleased(), 0);

        token.mint(client, total);
        vm.prank(client);
        token.approve(address(fuzzEscrow), total);
        vm.prank(client);
        fuzzEscrow.fund();
        assertEq(token.balanceOf(address(fuzzEscrow)) + fuzzEscrow.totalReleased() + fuzzEscrow.totalRefunded(), total);

        uint256 providerBefore = token.balanceOf(provider);
        for (uint256 i; i < fuzzAmounts.length; ++i) {
            vm.prank(provider);
            fuzzEscrow.submitMilestone(i, keccak256(abi.encode(first, second, third, i)));
            vm.prank(client);
            fuzzEscrow.approveMilestone(i);
            assertLe(fuzzEscrow.totalReleased(), total);
            assertEq(
                token.balanceOf(address(fuzzEscrow)) + fuzzEscrow.totalReleased() + fuzzEscrow.totalRefunded(), total
            );
        }

        assertEq(fuzzEscrow.totalReleased(), total);
        assertEq(token.balanceOf(address(fuzzEscrow)), 0);
        assertEq(token.balanceOf(provider) - providerBefore, total);
        assertEq(uint256(fuzzEscrow.status()), uint256(MilestoneEscrow.DealStatus.Completed));
    }

    function _approveAndFund() internal {
        vm.prank(client);
        token.approve(address(escrow), TOTAL);
        vm.prank(client);
        escrow.fund();
    }

    function _submit(uint256 milestoneId) internal {
        _approveAndFund();
        vm.prank(provider);
        escrow.submitMilestone(milestoneId, keccak256(abi.encode("evidence", milestoneId)));
    }

    function _completeAgreement() internal {
        _approveAndFund();
        for (uint256 i; i < amounts.length; ++i) {
            vm.prank(provider);
            escrow.submitMilestone(i, keccak256(abi.encode("evidence", i)));
            vm.prank(client);
            escrow.approveMilestone(i);
        }
    }
}
