// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Counters.sol";
import "@openzeppelin/contracts/utils/Base64.sol";
import "@openzeppelin/contracts/utils/Strings.sol";
import "@reclaimprotocol/verifier-solidity-sdk/contracts/Reclaim.sol";
import "@reclaimprotocol/verifier-solidity-sdk/contracts/Addresses.sol";

/**
 * @title SocialProofPass
 * @dev NFT that represents verified social proofs using zkTLS technology
 * Supports both on-chain and off-chain verification modes
 * Each NFT certifies that the holder has verified their identity across multiple platforms
 */
contract SocialProofPass is ERC721, ERC721URIStorage, Ownable {
    using Counters for Counters.Counter;
    using Strings for uint256;

    Counters.Counter private _tokenIdCounter;

    // Struct to store verification data
    struct SocialProof {
        address holder;
        string[] verifiedProviders;
        bytes proofData;
        uint256 timestamp;
        uint8 verificationCount;
    }

    // Mapping from tokenId to social proof data
    mapping(uint256 => SocialProof) public socialProofs;

    // Mapping from address to their token IDs
    mapping(address => uint256[]) public holderTokens;

    // Mapping to track if a user has already minted (optional: enforce one per address)
    mapping(address => bool) public hasMinted;

    // Events
    event SocialProofPassMinted(
        address indexed to, 
        uint256 indexed tokenId, 
        string[] providers,
        uint256 timestamp
    );

    event ProofDataUpdated(
        uint256 indexed tokenId,
        string[] newProviders,
        uint256 timestamp
    );

    constructor() ERC721("SocialProofPass", "SPP") Ownable(msg.sender) {}

    /**
     * @dev Mint a new Social Proof Pass NFT
     * @param to Address to mint the NFT to
     * @param providers Array of verified provider names (e.g., ["github", "gmail"])
     * @param proofData Encoded proof data from zkTLS verification
     */
    function mintSocialProofPass(
        address to,
        string[] memory providers,
        bytes memory proofData
    ) public onlyOwner returns (uint256) {
        require(providers.length > 0, "At least one provider required");
        require(to != address(0), "Invalid recipient address");

        uint256 tokenId = _tokenIdCounter.current();
        _tokenIdCounter.increment();

        // Store social proof data
        socialProofs[tokenId] = SocialProof({
            holder: to,
            verifiedProviders: providers,
            proofData: proofData,
            timestamp: block.timestamp,
            verificationCount: uint8(providers.length)
        });

        // Track holder's tokens
        holderTokens[to].push(tokenId);
        hasMinted[to] = true;

        // Mint the NFT
        _safeMint(to, tokenId);

        // Set token URI with dynamic metadata
        string memory uri = generateTokenURI(tokenId);
        _setTokenURI(tokenId, uri);

        emit SocialProofPassMinted(to, tokenId, providers, block.timestamp);

        return tokenId;
    }

    /**
     * @dev Add more verified providers to an existing Social Proof Pass
     * @param tokenId The token to update
     * @param newProviders Additional providers to add
     * @param newProofData Additional proof data
     */
    function addVerifiedProviders(
        uint256 tokenId,
        string[] memory newProviders,
        bytes memory newProofData
    ) public onlyOwner {
        require(_exists(tokenId), "Token does not exist");
        require(newProviders.length > 0, "No providers to add");

        SocialProof storage proof = socialProofs[tokenId];

        // Add new providers
        for (uint i = 0; i < newProviders.length; i++) {
            proof.verifiedProviders.push(newProviders[i]);
        }

        // Update proof data (append)
        proof.proofData = abi.encodePacked(proof.proofData, newProofData);
        proof.verificationCount = uint8(proof.verifiedProviders.length);

        // Update token URI
        string memory uri = generateTokenURI(tokenId);
        _setTokenURI(tokenId, uri);

        emit ProofDataUpdated(tokenId, newProviders, block.timestamp);
    }

    /**
     * @dev Generate dynamic token URI with on-chain SVG metadata
     * @param tokenId The token ID
     */
    function generateTokenURI(uint256 tokenId) internal view returns (string memory) {
        require(_exists(tokenId), "Token does not exist");

        SocialProof memory proof = socialProofs[tokenId];
        
        // Generate SVG image
        string memory svg = generateSVG(tokenId, proof);
        
        // Build metadata JSON
        string memory json = Base64.encode(
            bytes(
                string(
                    abi.encodePacked(
                        '{"name": "Social Proof Pass #',
                        tokenId.toString(),
                        '", "description": "A verified social proof certificate demonstrating identity across ',
                        uint256(proof.verificationCount).toString(),
                        ' platforms using zkTLS technology.", "image": "data:image/svg+xml;base64,',
                        Base64.encode(bytes(svg)),
                        '", "attributes": [',
                        generateAttributes(proof),
                        ']}'
                    )
                )
            )
        );

        return string(abi.encodePacked("data:application/json;base64,", json));
    }

    /**
     * @dev Generate SVG image for the NFT
     */
    function generateSVG(uint256 tokenId, SocialProof memory proof) internal pure returns (string memory) {
        string memory providers = "";
        
        // Build provider badges
        for (uint i = 0; i < proof.verifiedProviders.length && i < 6; i++) {
            providers = string(
                abi.encodePacked(
                    providers,
                    '<rect x="',
                    uint256(50 + (i * 70)).toString(),
                    '" y="200" width="60" height="30" rx="15" fill="#8B5CF6"/>',
                    '<text x="',
                    uint256(80 + (i * 70)).toString(),
                    '" y="220" font-family="Arial" font-size="12" fill="white" text-anchor="middle">',
                    getProviderIcon(proof.verifiedProviders[i]),
                    '</text>'
                )
            );
        }

        return string(
            abi.encodePacked(
                '<svg width="500" height="500" xmlns="http://www.w3.org/2000/svg">',
                '<defs>',
                '<linearGradient id="grad1" x1="0%" y1="0%" x2="100%" y2="100%">',
                '<stop offset="0%" style="stop-color:#667eea;stop-opacity:1" />',
                '<stop offset="100%" style="stop-color:#764ba2;stop-opacity:1" />',
                '</linearGradient>',
                '</defs>',
                '<rect width="500" height="500" fill="url(#grad1)"/>',
                '<circle cx="250" cy="100" r="40" fill="#FBBF24" opacity="0.3"/>',
                '<text x="250" y="110" font-family="Arial" font-size="36" font-weight="bold" fill="white" text-anchor="middle">',
                unicode"🛡️",
                '</text>',
                '<text x="250" y="160" font-family="Arial" font-size="28" font-weight="bold" fill="white" text-anchor="middle">Social Proof Pass</text>',
                '<text x="250" y="185" font-family="Arial" font-size="14" fill="#E9D5FF" text-anchor="middle">#',
                tokenId.toString(),
                '</text>',
                providers,
                '<rect x="50" y="260" width="400" height="80" rx="10" fill="rgba(255,255,255,0.1)"/>',
                '<text x="250" y="290" font-family="Arial" font-size="16" fill="white" text-anchor="middle">Verified Platforms: ',
                uint256(proof.verificationCount).toString(),
                '</text>',
                '<text x="250" y="320" font-family="Arial" font-size="12" fill="#C4B5FD" text-anchor="middle">zkTLS Verified</text>',
                '<text x="250" y="380" font-family="Arial" font-size="10" fill="#A78BFA" text-anchor="middle">',
                addressToString(proof.holder),
                '</text>',
                '<text x="250" y="450" font-family="Arial" font-size="10" fill="#DDD6FE" text-anchor="middle">',
                'Issued: Block ',
                uint256(proof.timestamp).toString(),
                '</text>',
                '</svg>'
            )
        );
    }

    /**
     * @dev Get emoji icon for provider
     */
    function getProviderIcon(string memory provider) internal pure returns (string memory) {
        bytes32 providerHash = keccak256(bytes(provider));
        
        if (providerHash == keccak256(bytes("github"))) return unicode"⚡";
        if (providerHash == keccak256(bytes("gmail"))) return unicode"📧";
        if (providerHash == keccak256(bytes("linkedin"))) return unicode"💼";
        if (providerHash == keccak256(bytes("twitter"))) return unicode"🐦";
        
        return unicode"✓";
    }

    /**
     * @dev Generate attributes for metadata
     */
    function generateAttributes(SocialProof memory proof) internal pure returns (string memory) {
        string memory attributes = string(
            abi.encodePacked(
                '{"trait_type": "Verification Count", "value": ',
                uint256(proof.verificationCount).toString(),
                '}, {"trait_type": "Issue Date", "value": ',
                uint256(proof.timestamp).toString(),
                '}'
            )
        );

        // Add provider attributes
        for (uint i = 0; i < proof.verifiedProviders.length; i++) {
            attributes = string(
                abi.encodePacked(
                    attributes,
                    ', {"trait_type": "',
                    capitalizeFirst(proof.verifiedProviders[i]),
                    '", "value": "Verified"}'
                )
            );
        }

        return attributes;
    }

    /**
     * @dev Capitalize first letter of string
     */
    function capitalizeFirst(string memory str) internal pure returns (string memory) {
        bytes memory strBytes = bytes(str);
        if (strBytes.length == 0) return str;
        
        bytes memory result = new bytes(strBytes.length);
        result[0] = bytes1(uint8(strBytes[0]) >= 97 && uint8(strBytes[0]) <= 122 
            ? uint8(strBytes[0]) - 32 
            : uint8(strBytes[0]));
        
        for (uint i = 1; i < strBytes.length; i++) {
            result[i] = strBytes[i];
        }
        
        return string(result);
    }

    /**
     * @dev Convert address to string
     */
    function addressToString(address _addr) internal pure returns (string memory) {
        bytes32 value = bytes32(uint256(uint160(_addr)));
        bytes memory alphabet = "0123456789abcdef";
        bytes memory str = new bytes(42);
        str[0] = '0';
        str[1] = 'x';
        
        for (uint i = 0; i < 20; i++) {
            str[2 + i * 2] = alphabet[uint8(value[i + 12] >> 4)];
            str[3 + i * 2] = alphabet[uint8(value[i + 12] & 0x0f)];
        }
        
        return string(str);
    }

    /**
     * @dev Get social proof data for a token
     */
    function getSocialProof(uint256 tokenId) external view returns (
        address holder,
        string[] memory verifiedProviders,
        uint256 timestamp,
        uint8 verificationCount
    ) {
        require(_exists(tokenId), "Token does not exist");
        SocialProof memory proof = socialProofs[tokenId];
        
        return (
            proof.holder,
            proof.verifiedProviders,
            proof.timestamp,
            proof.verificationCount
        );
    }

    /**
     * @dev Get all tokens owned by an address
     */
    function getTokensByHolder(address holder) external view returns (uint256[] memory) {
        return holderTokens[holder];
    }

    /**
     * @dev Check if an address has a Social Proof Pass
     */
    function hasProofPass(address holder) external view returns (bool) {
        return hasMinted[holder];
    }

    /**
     * @dev Override functions for ERC721URIStorage
     */
    function _burn(uint256 tokenId) internal override(ERC721, ERC721URIStorage) {
        super._burn(tokenId);
    }

    function tokenURI(uint256 tokenId) public view override(ERC721, ERC721URIStorage) returns (string memory) {
        return super.tokenURI(tokenId);
    }

    function supportsInterface(bytes4 interfaceId) public view override(ERC721, ERC721URIStorage) returns (bool) {
        return super.supportsInterface(interfaceId);
    }

    /**
     * @dev Check if token exists
     */
    function _exists(uint256 tokenId) internal view returns (bool) {
        return _ownerOf(tokenId) != address(0);
    }
}
