const express = require('express');
const cors = require('cors');
const { ReclaimProofRequest, verifyProof } = require('@reclaimprotocol/js-sdk');
const { ethers } = require('ethers');
require('dotenv').config();

// Debug: Check if ReclaimProofRequest is properly imported
console.log('Import check - ReclaimProofRequest:', typeof ReclaimProofRequest);
console.log('Import check - ReclaimProofRequest methods:', ReclaimProofRequest ? Object.getOwnPropertyNames(ReclaimProofRequest) : 'undefined');

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.text({ type: '*/*', limit: '50mb' }));

// Simple root route to test if routes are working
app.get('/', (req, res) => {
  res.json({ message: 'Backend server is running', status: 'ok' });
});

const BASE_URL = process.env.BASE_URL || "http://localhost:3000";

// Provider configurations from environment variables
const PROVIDERS = {
  github: {
    APP_ID: process.env.GITHUB_APP_ID,
    APP_SECRET: process.env.GITHUB_APP_SECRET,
    PROVIDER_ID: process.env.GITHUB_PROVIDER_ID
  },
  gmail: {
    APP_ID: process.env.GMAIL_APP_ID,
    APP_SECRET: process.env.GMAIL_APP_SECRET,
    PROVIDER_ID: process.env.GMAIL_PROVIDER_ID
  },
  linkedin: {
    APP_ID: process.env.LINKEDIN_APP_ID,
    APP_SECRET: process.env.LINKEDIN_APP_SECRET,
    PROVIDER_ID: process.env.LINKEDIN_PROVIDER_ID
  },
  twitter: {
    APP_ID: process.env.TWITTER_APP_ID,
    APP_SECRET: process.env.TWITTER_APP_SECRET,
    PROVIDER_ID: process.env.TWITTER_PROVIDER_ID
  }
};

// In-memory storage for verification states
const verificationSessions = new Map();
const verificationProofs = new Map();

// Blockchain configuration
const NETWORK_RPC = process.env.RPC_URL;
const PRIVATE_KEY = process.env.DEPLOYER_PRIVATE_KEY;
const NFT_CONTRACT_ADDRESS = process.env.NFT_CONTRACT_ADDRESS;

// NFT Contract ABI (simplified for backend use)
const NFT_CONTRACT_ABI = [
  // Mint function for backend (off-chain verification)
  "function mintSocialProofPass(address to, string[] memory providers, bytes memory proofData) external returns (uint256)",
  
  // Check if user has already minted
  "function hasAlreadyMinted(address user) external view returns (bool)",
  
  // Get social proof data
  "function getSocialProof(uint256 tokenId) external view returns (address holder, string[] memory verifiedProviders, uint8 verificationCount, uint256 timestamp, bool verified)",
  
  // Token URI
  "function tokenURI(uint256 tokenId) external view returns (string memory)",
  
  // Events
  "event SocialProofPassMinted(address indexed to, uint256 indexed tokenId, string[] providers, uint256 timestamp)",
  "event ProofVerifiedOnChain(address indexed user, uint256 indexed tokenId, string provider, uint256 timestamp)"
];

/**
 * Route to get configuration status and setup instructions
 * GET /config-status
 */
app.get('/config-status', (req, res) => {
  const configStatus = {};
  let hasAnyConfigured = false;

  Object.keys(PROVIDERS).forEach(provider => {
    const { APP_ID, APP_SECRET, PROVIDER_ID } = PROVIDERS[provider];
    const isConfigured = APP_ID && APP_SECRET && PROVIDER_ID && 
                        !APP_ID.includes('your_') && 
                        !APP_SECRET.includes('your_') && 
                        !PROVIDER_ID.includes('your_');
    
    configStatus[provider] = {
      configured: isConfigured,
      hasPlaceholders: APP_ID?.includes('your_') || APP_SECRET?.includes('your_') || PROVIDER_ID?.includes('your_')
    };
    
    if (isConfigured) hasAnyConfigured = true;
  });

  res.json({
    providers: configStatus,
    hasAnyConfigured,
    setupInstructions: {
      message: "To configure providers, visit https://dev.reclaimprotocol.org/ and update your .env file",
      example: {
        "GITHUB_APP_ID": "your_actual_app_id",
        "GITHUB_APP_SECRET": "your_actual_app_secret", 
        "GITHUB_PROVIDER_ID": "your_actual_provider_id"
      }
    }
  });
});

/**
 * Test route
 */
app.get('/test', (req, res) => {
  console.log('Test route hit!');
  res.json({ message: 'Test route working', reclaimType: typeof ReclaimProofRequest });
});

/**
 * Route to generate SDK configuration for a specific provider
 * GET /generate-config?provider=github&address=0x123...
 */
app.get('/generate-config', async (req, res) => {
  console.log('Route handler called - ReclaimProofRequest type:', typeof ReclaimProofRequest);
  const { provider, address } = req.query;

  if (!provider || !PROVIDERS[provider]) {
    return res.status(400).json({ error: 'Invalid provider' });
  }

  const { APP_ID, APP_SECRET, PROVIDER_ID } = PROVIDERS[provider];

  // Check if credentials are properly configured
  if (!APP_ID || !APP_SECRET || !PROVIDER_ID || 
      APP_ID.includes('your_') || APP_SECRET.includes('your_') || PROVIDER_ID.includes('your_')) {
    return res.status(500).json({ 
      error: 'Provider not configured', 
      message: `Please configure ${provider} credentials in your .env file. Get them from https://dev.reclaimprotocol.org/`,
      details: `Missing or placeholder values for ${provider.toUpperCase()}_APP_ID, ${provider.toUpperCase()}_APP_SECRET, or ${provider.toUpperCase()}_PROVIDER_ID`
    });
  }

  try {
    console.log('Attempting to initialize ReclaimProofRequest with:', { APP_ID, APP_SECRET, PROVIDER_ID });
    console.log('ReclaimProofRequest type:', typeof ReclaimProofRequest);
    console.log('ReclaimProofRequest:', ReclaimProofRequest);
    
    const reclaimProofRequest = await ReclaimProofRequest.init(
      APP_ID, 
      APP_SECRET, 
      PROVIDER_ID
    );
    
    console.log('ReclaimProofRequest initialized successfully');
    
    // Set callback URL for this specific provider
    reclaimProofRequest.setAppCallbackUrl(`${BASE_URL}/receive-proofs/${provider}`);
    
    // Note: setContext method not available in SDK v4.5.1, skipping context setting
    // Context can be handled during verification instead
    
    const requestUrl = await reclaimProofRequest.getRequestUrl();
    const reclaimProofRequestConfig = reclaimProofRequest.toJsonString();

    // Create session ID
    const sessionId = `${provider}-${Date.now()}`;
    verificationSessions.set(sessionId, { 
      provider, 
      status: 'pending',
      address,
      createdAt: Date.now()
    });

    console.log(`Generated verification config for ${provider}, session: ${sessionId}`);

    return res.json({ 
      reclaimProofRequestConfig,
      requestUrl,
      sessionId,
      provider
    });
  } catch (error) {
    console.error('Error generating request config:', error);
    return res.status(500).json({ 
      error: 'Failed to generate request config',
      details: error.message 
    });
  }
});

/**
 * Route to receive proofs for each provider
 * POST /receive-proofs/:provider
 */
app.post('/receive-proofs/:provider', async (req, res) => {
  const { provider } = req.params;

  if (!PROVIDERS[provider]) {
    return res.status(400).json({ error: 'Invalid provider' });
  }

  try {
    // Decode the proof
    const decodedBody = decodeURIComponent(req.body);
    const proof = JSON.parse(decodedBody);

    console.log(`Received proof for ${provider}`);

    // Verify the proof
    const isValid = await verifyProof(proof);
    
    if (!isValid) {
      console.error(`Invalid proof for ${provider}`);
      return res.status(400).json({ error: 'Invalid proof' });
    }

    console.log(`✓ Valid proof verified for ${provider}`);

    // Store the proof
    const proofKey = `${provider}-${Date.now()}`;
    verificationProofs.set(proofKey, {
      provider,
      proof,
      timestamp: Date.now(),
      status: 'verified'
    });

    // Update session status - find most recent pending session for this provider
    for (const [sessionId, session] of verificationSessions.entries()) {
      if (session.provider === provider && session.status === 'pending') {
        verificationSessions.set(sessionId, {
          ...session,
          status: 'verified',
          proofKey,
          proof,
          verifiedAt: Date.now()
        });
        console.log(`Updated session ${sessionId} to verified`);
        break;
      }
    }

    return res.sendStatus(200);
  } catch (error) {
    console.error(`Error processing proof for ${provider}:`, error);
    return res.status(500).json({ 
      error: 'Failed to process proof',
      details: error.message 
    });
  }
});

/**
 * Route to check verification status
 * GET /verification-status?provider=github
 */
app.get('/verification-status', async (req, res) => {
  const { provider } = req.query;

  // Find most recent session for this provider
  let latestSession = null;
  let latestSessionId = null;
  
  for (const [sessionId, session] of verificationSessions.entries()) {
    if (session.provider === provider) {
      if (!latestSession || session.createdAt > latestSession.createdAt) {
        latestSession = session;
        latestSessionId = sessionId;
      }
    }
  }

  if (!latestSession) {
    return res.json({ status: 'not_found' });
  }

  return res.json({
    status: latestSession.status,
    sessionId: latestSessionId,
    proof: latestSession.proof || null,
    provider: latestSession.provider
  });
});

/**
 * Route to mint Social Proof Pass NFT (Off-Chain Verification)
 * POST /mint-social-proof-nft
 */
app.post('/mint-social-proof-nft', async (req, res) => {
  const { walletAddress, proofs, verifiedProviders, mode } = req.body;

  if (!walletAddress || !proofs || !verifiedProviders || verifiedProviders.length === 0) {
    return res.status(400).json({ error: 'Invalid request data' });
  }

  if (!PRIVATE_KEY || !NFT_CONTRACT_ADDRESS) {
    return res.status(500).json({ 
      error: 'Server configuration incomplete', 
      message: 'Please set DEPLOYER_PRIVATE_KEY and NFT_CONTRACT_ADDRESS in environment variables' 
    });
  }

  try {
    // Initialize provider and signer
    const provider = new ethers.JsonRpcProvider(NETWORK_RPC);
    const signer = new ethers.Wallet(PRIVATE_KEY, provider);

    const nftContract = new ethers.Contract(NFT_CONTRACT_ADDRESS, NFT_CONTRACT_ABI, signer);

    // Prepare proof data
    const proofData = ethers.toUtf8Bytes(JSON.stringify({
      timestamp: Date.now(),
      mode: mode || 'offchain',
      providers: verifiedProviders,
      proofs: Object.keys(proofs).reduce((acc, key) => {
        if (proofs[key] && proofs[key].claimData) {
          acc[key] = {
            claimData: proofs[key].claimData,
            signatures: proofs[key].signatures
          };
        }
        return acc;
      }, {})
    }));

    console.log(`Minting Social Proof Pass for ${walletAddress}`);
    console.log(`Verified providers: ${verifiedProviders.join(', ')}`);
    
    // Mint NFT
    const tx = await nftContract.mintSocialProofPass(
      walletAddress,
      verifiedProviders,
      proofData
    );

    console.log(`Transaction submitted: ${tx.hash}`);
    
    const receipt = await tx.wait();
    
    console.log(`Transaction confirmed in block ${receipt.blockNumber}`);

    // Extract tokenId from event logs
    let tokenId = 'unknown';
    try {
      const mintEvent = receipt.logs.find(log => {
        try {
          const parsed = nftContract.interface.parseLog(log);
          return parsed && parsed.name === 'SocialProofPassMinted';
        } catch {
          return false;
        }
      });

      if (mintEvent) {
        const parsedEvent = nftContract.interface.parseLog(mintEvent);
        tokenId = parsedEvent.args.tokenId.toString();
      }
    } catch (error) {
      console.error('Error parsing event:', error);
    }

    console.log(`✓ NFT minted successfully! TokenId: ${tokenId}`);

    return res.json({
      success: true,
      transactionHash: receipt.hash,
      tokenId,
      providers: verifiedProviders,
      blockNumber: receipt.blockNumber
    });

  } catch (error) {
    console.error('Error minting NFT:', error);
    return res.status(500).json({ 
      success: false,
      error: 'Failed to mint NFT',
      details: error.message 
    });
  }
});

/**
 * Route to prepare on-chain verification data
 * POST /prepare-onchain-mint
 */
app.post('/prepare-onchain-mint', async (req, res) => {
  const { walletAddress, reclaimProofs, verifiedProviders } = req.body;

  if (!walletAddress || !reclaimProofs || !verifiedProviders) {
    return res.status(400).json({ error: 'Invalid request data' });
  }

  try {
    // Transform Reclaim proofs for on-chain verification
    const transformedProofs = Object.values(reclaimProofs).map(proof => ({
      claimInfo: {
        provider: proof.provider || "",
        parameters: proof.parameters || "",
        context: proof.context || ""
      },
      signedClaim: {
        claim: {
          identifier: proof.identifier || "0x0000000000000000000000000000000000000000000000000000000000000000",
          owner: proof.owner || walletAddress,
          timestampS: proof.timestampS || Math.floor(Date.now() / 1000),
          epoch: proof.epoch || 1
        },
        signatures: proof.signatures || []
      }
    }));

    return res.json({
      transformedProofs,
      contractAddress: NFT_CONTRACT_ADDRESS,
      abi: NFT_CONTRACT_ABI,
      verifiedProviders,
      chainId: (await new ethers.JsonRpcProvider(NETWORK_RPC).getNetwork()).chainId
    });

  } catch (error) {
    console.error('Error preparing on-chain mint:', error);
    return res.status(500).json({ 
      error: 'Failed to prepare on-chain mint',
      details: error.message 
    });
  }
});

/**
 * Route to test proof verification before on-chain submission
 * POST /test-proof-verification
 */
app.post('/test-proof-verification', async (req, res) => {
  const { proof } = req.body;

  if (!proof || !NFT_CONTRACT_ADDRESS) {
    return res.status(400).json({ error: 'Invalid request data or contract not configured' });
  }

  try {
    const provider = new ethers.JsonRpcProvider(NETWORK_RPC);
    const contract = new ethers.Contract(NFT_CONTRACT_ADDRESS, NFT_CONTRACT_ABI, provider);

    // Transform single proof for testing
    const transformedProof = {
      claimInfo: {
        provider: proof.provider || "",
        parameters: proof.parameters || "",
        context: proof.context || ""
      },
      signedClaim: {
        claim: {
          identifier: proof.identifier || "0x0000000000000000000000000000000000000000000000000000000000000000",
          owner: proof.owner || "0x0000000000000000000000000000000000000000",
          timestampS: proof.timestampS || Math.floor(Date.now() / 1000),
          epoch: proof.epoch || 1
        },
        signatures: proof.signatures || []
      }
    };

    // Test verification on contract
    const [isValid, contextData] = await contract.verifyProofAndExtractData(transformedProof);

    return res.json({
      isValid,
      contextData,
      transformedProof
    });

  } catch (error) {
    console.error('Error testing proof verification:', error);
    return res.status(500).json({ 
      error: 'Failed to test proof verification',
      details: error.message 
    });
  }
});

/**
 * Health check endpoint
 * GET /health
 */
app.get('/health', (req, res) => {
  const configuredProviders = Object.keys(PROVIDERS).filter(key => {
    const provider = PROVIDERS[key];
    return provider.APP_ID && provider.APP_SECRET && provider.PROVIDER_ID;
  });

  res.json({ 
    status: 'healthy',
    timestamp: Date.now(),
    supportedProviders: Object.keys(PROVIDERS),
    configuredProviders,
    contractConfigured: !!(PRIVATE_KEY && NFT_CONTRACT_ADDRESS),
    sessions: verificationSessions.size,
    proofs: verificationProofs.size
  });
});

/**
 * Get all sessions (for debugging)
 * GET /debug/sessions
 */
app.get('/debug/sessions', (req, res) => {
  const sessions = Array.from(verificationSessions.entries()).map(([id, session]) => ({
    id,
    ...session
  }));
  
  res.json({ sessions });
});

// Start server
app.listen(port, () => {
  console.log('┌────────────────────────────────────────────┐');
  console.log('│  zkTLS Social Proof Backend Server        │');
  console.log('└────────────────────────────────────────────┘');
  console.log(`\n🚀 Server running at: http://localhost:${port}`);
  console.log(`📍 Base URL: ${BASE_URL}`);
  console.log(`\n🔧 Supported providers: ${Object.keys(PROVIDERS).join(', ')}`);
  
  const configuredProviders = Object.keys(PROVIDERS).filter(key => {
    const provider = PROVIDERS[key];
    return provider.APP_ID && provider.APP_SECRET && provider.PROVIDER_ID;
  });
  
  console.log(`✓ Configured providers: ${configuredProviders.length > 0 ? configuredProviders.join(', ') : 'None (update .env file)'}`);
  console.log(`✓ Contract configured: ${PRIVATE_KEY && NFT_CONTRACT_ADDRESS ? 'Yes' : 'No (update .env file)'}`);
  console.log('\n───────────────────────────────────────────');
});

// Handle graceful shutdown
process.on('SIGTERM', () => {
  console.log('\n⚠️  SIGTERM signal received: closing HTTP server');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('\n⚠️  SIGINT signal received: closing HTTP server');
  process.exit(0);
});
