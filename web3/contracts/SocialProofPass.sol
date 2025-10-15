// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Counters.sol";
import "@openzeppelin/contracts/utils/Strings.sol";
import "@openzeppelin/contracts/utils/Base64.sol";

/**
 * @dev Interface for Reclaim Protocol verification
 * This allows us to interact with Reclaim without importing their contracts
 */
interface IReclaim {
    struct ClaimInfo {
        string provider;
        string parameters;
        string context;
    }
    
    struct SignedClaim {
        Claim claim;
        bytes[] signatures;
    }
    
    struct Claim {
        bytes32 identifier;
        address owner;
        uint32 timestampS;
        uint32 epoch;
    }
    
    struct Proof {
        ClaimInfo claimInfo;
        SignedClaim signedClaim;
    }
    
    function verifyProof(Proof memory proof) external view;
}

/**
 * @title SocialProofPass
 * @dev NFT that represents verified social proofs using zkTLS technology
 * Supports both on-chain and off-chain verification modes using Reclaim Protocol
 */
contract SocialProofPass is ERC721, ERC721URIStorage, Ownable {
    using Counters for Counters.Counter;
    using Strings for uint256;

    Counters.Counter private _tokenIdCounter;
    
    // Reclaim Protocol contract address
    address public reclaimAddress;

    // Struct to store verification data
    struct SocialProof {
        address holder;
        string[] verifiedProviders;
        uint8 verificationCount;
        uint256 timestamp;
        bool verified;
    }

    // Mapping from tokenId to social proof data
    mapping(uint256 => SocialProof) public socialProofs;
    
    // Mapping from address to their token IDs
    mapping(address => uint256[]) public holderTokens;
    
    // Mapping to track if a user has already minted (optional: can be disabled)
    mapping(address => bool) public hasMinted;
    
    // Mapping to track supported provider IDs
    mapping(string => bool) public supportedProviders;

    // Events
    event SocialProofPassMinted(
        address indexed to, 
        uint256 indexed tokenId,
        string[] providers,
        uint256 timestamp
    );

    event ProofVerifiedOnChain(
        address indexed user,
        uint256 indexed tokenId,
        string provider,
        uint256 timestamp
    );

    event ProofDataUpdated(
        uint256 indexed tokenId,
        string[] newProviders,
        uint256 timestamp
    );

    constructor() ERC721("SocialProofPass", "SPP") Ownable() {
        // Set Reclaim Protocol contract address for Sepolia testnet
        reclaimAddress = 0xAe94FB09711e1c6B057853a515483792d8e474d0;
        
        // Initialize supported providers
        supportedProviders["github"] = true;
        supportedProviders["gmail"] = true;
        supportedProviders["linkedin"] = true;
        supportedProviders["twitter"] = true;
    }

    /**
     * @dev Verify a single proof using Reclaim Protocol
     * Internal function that handles the actual verification
     */
    function _verifyReclaimProof(IReclaim.Proof memory proof) internal view {
        // Call Reclaim Protocol's verifyProof function
        IReclaim(reclaimAddress).verifyProof(proof);
        // If this doesn't revert, the proof is valid
    }

    /**
     * @dev Extract context field from proof using Reclaim's utility
     * This can be used to extract provider-specific data
     */
    function extractFieldFromContext(string memory data, string memory target)
        public pure returns (string memory) {
        // Implementation of context field extraction
        // This should match Reclaim's utility function
        bytes memory dataBytes = bytes(data);
        bytes memory targetBytes = bytes(target);
        
        if (dataBytes.length < targetBytes.length) {
            return "";
        }
        
        for (uint i = 0; i <= dataBytes.length - targetBytes.length; i++) {
            bool found = true;
            for (uint j = 0; j < targetBytes.length; j++) {
                if (dataBytes[i + j] != targetBytes[j]) {
                    found = false;
                    break;
                }
            }
            
            if (found) {
                // Found the target, now extract the value
                uint start = i + targetBytes.length;
                uint end = start;
                
                // Find the end of the value (until next quote)
                while (end < dataBytes.length && dataBytes[end] != '"') {
                    end++;
                }
                
                bytes memory result = new bytes(end - start);
                for (uint k = 0; k < end - start; k++) {
                    result[k] = dataBytes[start + k];
                }
                
                return string(result);
            }
        }
        
        return "";
    }

    /**
     * @dev Mint NFT with on-chain proof verification
     * Users can call this directly with their zkTLS proofs
     */
    function mintWithProofVerification(
        IReclaim.Proof[] memory proofs,
        string[] memory providers
    ) external returns (uint256) {
        require(proofs.length > 0, "At least one proof required");
        require(proofs.length == providers.length, "Proofs and providers length mismatch");
        require(!hasMinted[msg.sender], "Already minted");

        // Verify each proof on-chain using Reclaim Protocol
        for (uint i = 0; i < proofs.length; i++) {
            require(supportedProviders[providers[i]], "Unsupported provider");
            
            // Verify the proof using Reclaim Protocol
            _verifyReclaimProof(proofs[i]);
            
            // Optional: Extract and validate context data
            // For example, verify that the proof context contains expected user data
            // string memory contextAddress = extractFieldFromContext(
            //     proofs[i].claimInfo.context, 
            //     '"contextAddress":"'
            // );
            // require(
            //     keccak256(abi.encodePacked(contextAddress)) == keccak256(abi.encodePacked(msg.sender)),
            //     "Context address mismatch"
            // );
            
            emit ProofVerifiedOnChain(msg.sender, _tokenIdCounter.current(), providers[i], block.timestamp);
        }

        // Mint the NFT
        uint256 tokenId = _tokenIdCounter.current();
        _tokenIdCounter.increment();
        
        _safeMint(msg.sender, tokenId);
        
        // Store social proof data
        socialProofs[tokenId] = SocialProof({
            holder: msg.sender,
            verifiedProviders: providers,
            verificationCount: uint8(providers.length),
            timestamp: block.timestamp,
            verified: true
        });
        
        holderTokens[msg.sender].push(tokenId);
        hasMinted[msg.sender] = true;
        
        // Generate and set token URI
        string memory uri = generateTokenURI(tokenId);
        _setTokenURI(tokenId, uri);

        emit SocialProofPassMinted(msg.sender, tokenId, providers, block.timestamp);
        
        return tokenId;
    }

    /**
     * @dev Mint NFT through backend verification (off-chain mode)
     * Only owner (backend) can call this after verifying proofs off-chain
     */
    function mintSocialProofPass(
        address to,
        string[] memory providers,
        bytes memory /* proofData */
    ) external onlyOwner returns (uint256) {
        require(providers.length > 0, "At least one provider required");
        require(!hasMinted[to], "Already minted");

        uint256 tokenId = _tokenIdCounter.current();
        _tokenIdCounter.increment();
        
        _safeMint(to, tokenId);
        
        // Store social proof data
        socialProofs[tokenId] = SocialProof({
            holder: to,
            verifiedProviders: providers,
            verificationCount: uint8(providers.length),
            timestamp: block.timestamp,
            verified: true
        });
        
        holderTokens[to].push(tokenId);
        hasMinted[to] = true;
        
        // Generate and set token URI
        string memory uri = generateTokenURI(tokenId);
        _setTokenURI(tokenId, uri);

        emit SocialProofPassMinted(to, tokenId, providers, block.timestamp);
        
        return tokenId;
    }

    /**
     * @dev Add more verified providers to existing token (on-chain verification)
     */
    function addProvidersWithVerification(
        uint256 tokenId,
        IReclaim.Proof[] memory newProofs,
        string[] memory newProviders
    ) external {
        require(_exists(tokenId), "Token does not exist");
        require(ownerOf(tokenId) == msg.sender, "Not token owner");
        require(newProofs.length == newProviders.length, "Arrays length mismatch");

        // Verify new proofs
        for (uint i = 0; i < newProofs.length; i++) {
            require(supportedProviders[newProviders[i]], "Unsupported provider");
            _verifyReclaimProof(newProofs[i]);
            
            emit ProofVerifiedOnChain(msg.sender, tokenId, newProviders[i], block.timestamp);
        }

        // Update social proof data
        SocialProof storage proof = socialProofs[tokenId];
        
        // Add new providers to existing ones
        for (uint i = 0; i < newProviders.length; i++) {
            proof.verifiedProviders.push(newProviders[i]);
        }
        
        proof.verificationCount = uint8(proof.verifiedProviders.length);
        proof.timestamp = block.timestamp;

        // Update token URI
        string memory newUri = generateTokenURI(tokenId);
        _setTokenURI(tokenId, newUri);

        emit ProofDataUpdated(tokenId, newProviders, block.timestamp);
    }

    /**
     * @dev Verify a proof and extract provider data (view function for testing)
     */
    function verifyProofAndExtractData(IReclaim.Proof memory proof) 
        external view returns (bool isValid, string memory contextData) {
        try this.testVerifyProof(proof) {
            return (true, proof.claimInfo.context);
        } catch {
            return (false, "");
        }
    }

    /**
     * @dev Test proof verification (external for try-catch)
     */
    function testVerifyProof(IReclaim.Proof memory proof) external view {
        _verifyReclaimProof(proof);
    }

    /**
     * @dev Add supported provider (only owner)
     */
    function addSupportedProvider(string memory provider) external onlyOwner {
        supportedProviders[provider] = true;
    }

    /**
     * @dev Remove supported provider (only owner)
     */
    function removeSupportedProvider(string memory provider) external onlyOwner {
        supportedProviders[provider] = false;
    }

    /**
     * @dev Update Reclaim Protocol contract address (only owner)
     */
    function updateReclaimAddress(address newReclaimAddress) external onlyOwner {
        reclaimAddress = newReclaimAddress;
    }

    /**
     * @dev Generate dynamic token URI with simple metadata
     */
    function generateTokenURI(uint256 tokenId) internal view returns (string memory) {
        require(_exists(tokenId), "Token does not exist");
        
        SocialProof memory proof = socialProofs[tokenId];
        
        // Simple attributes without complex string operations
        string memory json = Base64.encode(
            bytes(string(abi.encodePacked(
                '{"name": "Social Proof Pass #', Strings.toString(tokenId), '",',
                '"description": "zkTLS verified social proof NFT",',
                '"attributes": [',
                '{"trait_type": "Count", "value": ', Strings.toString(proof.verificationCount), '},',
                '{"trait_type": "Method", "value": "zkTLS"},',
                '{"trait_type": "Status", "value": "Verified"}',
                ']}'
            )))
        );
        
        return string(abi.encodePacked("data:application/json;base64,", json));
    }

    /**
     * @dev Get social proof data for a token
     */
    function getSocialProof(uint256 tokenId) external view returns (
        address holder,
        string[] memory verifiedProviders,
        uint8 verificationCount,
        uint256 timestamp,
        bool verified
    ) {
        require(_exists(tokenId), "Token does not exist");
        SocialProof memory proof = socialProofs[tokenId];
        return (proof.holder, proof.verifiedProviders, proof.verificationCount, proof.timestamp, proof.verified);
    }

    /**
     * @dev Get all tokens owned by an address
     */
    function getTokensByOwner(address owner) external view returns (uint256[] memory) {
        return holderTokens[owner];
    }

    /**
     * @dev Check if an address has already minted
     */
    function hasAlreadyMinted(address user) external view returns (bool) {
        return hasMinted[user];
    }

    /**
     * @dev Get Reclaim Protocol contract address
     */
    function getReclaimAddress() external view returns (address) {
        return reclaimAddress;
    }

    // Required overrides
    function _burn(uint256 tokenId) internal override(ERC721, ERC721URIStorage) {
        super._burn(tokenId);
    }

    function tokenURI(uint256 tokenId) public view override(ERC721, ERC721URIStorage) returns (string memory) {
        return super.tokenURI(tokenId);
    }

    function supportsInterface(bytes4 interfaceId) public view override(ERC721, ERC721URIStorage) returns (bool) {
        return super.supportsInterface(interfaceId);
    }
}