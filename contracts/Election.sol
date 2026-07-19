// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

contract Election {
    struct Candidate {
        uint id;
        string name;
        string party;
        string slogan;
        uint voteCount;
    }
    struct Voter {
        bool hasVoted;
        uint votedCandidateId;
        string email;
        uint timestamp;
    }

    address public admin;
    bool public isOpen;
    uint public candidateCount;
    uint public totalVotes;
    string public electionName;

    mapping(uint => Candidate) public candidates;
    mapping(address => Voter) public voters;
    mapping(string => bool) public emailHasVoted;

    event VoteCast(address indexed voter, uint candidateId, string email, uint timestamp);
    event CandidateAdded(uint id, string name, string party);
    event ElectionToggled(bool isOpen);

    modifier onlyAdmin() {
        require(msg.sender == admin, "Only admin");
        _;
    }

    constructor(string memory _electionName) {
        admin = msg.sender;
        isOpen = true;
        electionName = _electionName;
    }

    function addCandidate(string memory _name, string memory _party, string memory _slogan) public onlyAdmin {
        candidateCount++;
        candidates[candidateCount] = Candidate(candidateCount, _name, _party, _slogan, 0);
        emit CandidateAdded(candidateCount, _name, _party);
    }

    function toggleElection() public onlyAdmin {
        isOpen = !isOpen;
        emit ElectionToggled(isOpen);
    }

    function vote(uint _candidateId, string memory _email) public {
        require(isOpen, "Election is closed");
        require(!voters[msg.sender].hasVoted, "Already voted (address)");
        require(!emailHasVoted[_email], "Already voted (email)");
        require(_candidateId > 0 && _candidateId <= candidateCount, "Invalid candidate");

        voters[msg.sender] = Voter(true, _candidateId, _email, block.timestamp);
        emailHasVoted[_email] = true;
        candidates[_candidateId].voteCount++;
        totalVotes++;

        emit VoteCast(msg.sender, _candidateId, _email, block.timestamp);
    }

    function getCandidate(uint _id) public view returns (uint, string memory, string memory, string memory, uint) {
        Candidate memory c = candidates[_id];
        return (c.id, c.name, c.party, c.slogan, c.voteCount);
    }

    function hasEmailVoted(string memory _email) public view returns (bool) {
        return emailHasVoted[_email];
    }
}
