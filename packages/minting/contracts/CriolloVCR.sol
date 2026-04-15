// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract CriolloVCR {

    struct VCR {
        bytes32 vcrHash;
        bytes32 attestationHash;
        bytes32 eventHash;
        bytes32 animalHash;
        bytes32 environmentHash;
        bytes32 operatorHash;
        string  operatorRole;
        string  attestedAt;
        string  witnessedAt;
        bool    exists;
    }

    struct MintParams {
        bytes32 vcrHash;
        bytes32 attestationHash;
        bytes32 eventHash;
        bytes32 animalHash;
        bytes32 environmentHash;
        bytes32 operatorHash;
        string  operatorRole;
        string  attestedAt;
        string  witnessedAt;
    }

    address public owner;
    uint256 public totalVCRs;
    string  public constant VERSION = "1.0";

    mapping(bytes32 => VCR)       private vcrs;
    mapping(bytes32 => bytes32[]) private animalVCRs;
    mapping(bytes32 => bytes32[]) private operatorVCRs;

    event VCRMinted(
        bytes32 indexed vcrHash,
        bytes32 indexed animalHash,
        bytes32 indexed operatorHash,
        string  operatorRole,
        string  witnessedAt
    );

    modifier onlyOwner() {
        require(msg.sender == owner, "CriolloVCR: caller is not the owner");
        _;
    }

    modifier vcrNotExists(bytes32 vcrHash) {
        require(!vcrs[vcrHash].exists, "CriolloVCR: VCR already exists");
        _;
    }

    constructor() {
        owner     = msg.sender;
        totalVCRs = 0;
    }

    function mintVCR(MintParams calldata p)
        external
        onlyOwner
        vcrNotExists(p.vcrHash)
    {
        require(p.vcrHash         != bytes32(0), "vcrHash cannot be zero");
        require(p.attestationHash != bytes32(0), "attestationHash cannot be zero");
        require(p.eventHash       != bytes32(0), "eventHash cannot be zero");
        require(p.animalHash      != bytes32(0), "animalHash cannot be zero");

        vcrs[p.vcrHash] = VCR({
            vcrHash:         p.vcrHash,
            attestationHash: p.attestationHash,
            eventHash:       p.eventHash,
            animalHash:      p.animalHash,
            environmentHash: p.environmentHash,
            operatorHash:    p.operatorHash,
            operatorRole:    p.operatorRole,
            attestedAt:      p.attestedAt,
            witnessedAt:     p.witnessedAt,
            exists:          true
        });

        animalVCRs[p.animalHash].push(p.vcrHash);
        operatorVCRs[p.operatorHash].push(p.vcrHash);
        totalVCRs++;

        emit VCRMinted(p.vcrHash, p.animalHash, p.operatorHash, p.operatorRole, p.witnessedAt);
    }

    function getVCR(bytes32 vcrHash) external view returns (VCR memory) {
        require(vcrs[vcrHash].exists, "VCR does not exist");
        return vcrs[vcrHash];
    }

    function vcrExistsCheck(bytes32 vcrHash) external view returns (bool) {
        return vcrs[vcrHash].exists;
    }

    function getAnimalVCRs(bytes32 animalHash) external view returns (bytes32[] memory) {
        return animalVCRs[animalHash];
    }

    function getOperatorVCRs(bytes32 operatorHash) external view returns (bytes32[] memory) {
        return operatorVCRs[operatorHash];
    }

    function getTotalVCRs() external view returns (uint256) {
        return totalVCRs;
    }
}
