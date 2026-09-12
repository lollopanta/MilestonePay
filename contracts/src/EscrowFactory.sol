// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {MilestoneEscrow} from "./MilestoneEscrow.sol";

contract EscrowFactory {
    event EscrowCreated(
        address indexed escrow, address indexed client, address indexed provider, address arbiter, address paymentToken
    );

    mapping(address escrow => bool) public isEscrow;

    function createEscrow(address provider, address arbiter, address paymentToken, uint256[] calldata milestoneAmounts)
        external
        returns (address escrow)
    {
        MilestoneEscrow created = new MilestoneEscrow(msg.sender, provider, arbiter, paymentToken, milestoneAmounts);
        escrow = address(created);
        isEscrow[escrow] = true;
        emit EscrowCreated(escrow, msg.sender, provider, arbiter, paymentToken);
    }
}
