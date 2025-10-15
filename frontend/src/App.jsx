import { useState, useEffect } from 'react';
import { Shield, Github, Mail, Linkedin, Twitter, CheckCircle, Loader2, Award, Link2, Zap, AlertCircle, QrCode, Smartphone, Settings } from 'lucide-react';
import { Button } from './components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './components/ui/card';
import { Badge } from './components/ui/badge';
import { Progress } from './components/ui/progress';
import { Alert, AlertDescription } from './components/ui/alert';
import { ethers } from 'ethers';
import QRCode from 'react-qr-code';

const PROVIDERS = [
  { id: 'github', name: 'GitHub', icon: Github, color: 'bg-gray-800 hover:bg-gray-700', description: 'Verify GitHub username' },
  { id: 'gmail', name: 'Gmail', icon: Mail, color: 'bg-red-600 hover:bg-red-700', description: 'Verify Gmail account' },
  { id: 'linkedin', name: 'LinkedIn', icon: Linkedin, color: 'bg-blue-700 hover:bg-blue-800', description: 'Verify LinkedIn profile' },
  { id: 'twitter', name: 'Twitter/X', icon: Twitter, color: 'bg-black hover:bg-gray-900', description: 'Verify Twitter account' }
];

// Contract configuration
const CONTRACT_ADDRESS = import.meta.env.VITE_CONTRACT_ADDRESS || "0x77ACCd57F698fc3f344654846292775fF287307D";
const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || "http://localhost:3000";
const SEPOLIA_CHAIN_ID = parseInt(import.meta.env.VITE_SEPOLIA_CHAIN_ID) || 11155111;

function App() {
  const [selectedProviders, setSelectedProviders] = useState([]);
  const [verificationStates, setVerificationStates] = useState({});
  const [proofs, setProofs] = useState({});
  const [reclaimProofs, setReclaimProofs] = useState({});
  const [walletAddress, setWalletAddress] = useState('');
  const [isConnecting, setIsConnecting] = useState(false);
  const [mintingStatus, setMintingStatus] = useState('');
  const [nftMinted, setNftMinted] = useState(false);
  const [verificationMode, setVerificationMode] = useState('offchain'); // 'offchain' or 'onchain'
  const [chainId, setChainId] = useState(null);
  const [error, setError] = useState('');
  const [configStatus, setConfigStatus] = useState(null);
  const [verificationUrls, setVerificationUrls] = useState({});
  const [showQRCodes, setShowQRCodes] = useState({});

  // Check backend configuration status
  useEffect(() => {
    const checkConfig = async () => {
      try {
        const response = await fetch(`${BACKEND_URL}/config-status`);
        if (response.ok) {
          const status = await response.json();
          setConfigStatus(status);
        }
      } catch (error) {
        console.error('Failed to check config status:', error);
      }
    };
    checkConfig();
  }, []);

  const connectWallet = async () => {
    setIsConnecting(true);
    setError('');
    try {
      if (typeof window.ethereum !== 'undefined') {
        const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
        const chain = await window.ethereum.request({ method: 'eth_chainId' });
        setWalletAddress(accounts[0]);
        setChainId(parseInt(chain, 16));
        
        // Check if we're on Sepolia testnet
        if (parseInt(chain, 16) !== SEPOLIA_CHAIN_ID) {
          setError(`Please switch to Sepolia testnet (Chain ID: ${SEPOLIA_CHAIN_ID})`);
        }
      } else {
        setError('Please install MetaMask to continue');
      }
    } catch (error) {
      console.error('Error connecting wallet:', error);
      setError('Failed to connect wallet: ' + error.message);
    } finally {
      setIsConnecting(false);
    }
  };

  const toggleProvider = (providerId) => {
    setSelectedProviders(prev => 
      prev.includes(providerId) 
        ? prev.filter(id => id !== providerId)
        : [...prev, providerId]
    );
  };

  const startVerification = async (providerId) => {
    setVerificationStates(prev => ({ ...prev, [providerId]: 'loading' }));
    setError('');

    try {
      // Get verification config from backend
      const response = await fetch(`${BACKEND_URL}/generate-config?provider=${providerId}&address=${walletAddress}`);
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || `Backend error: ${response.status}`);
      }
      
      const data = await response.json();
      
      if (data.error) {
        throw new Error(data.message || data.error);
      }

      const { requestUrl } = data;
      
      // Store the URL for QR code generation
      setVerificationUrls(prev => ({ ...prev, [providerId]: requestUrl }));

      // Open verification URL in new window (for desktop)
      const verificationWindow = window.open(requestUrl, '_blank');

      // Poll for verification status
      const pollInterval = setInterval(async () => {
        try {
          const statusResponse = await fetch(`${BACKEND_URL}/verification-status?provider=${providerId}`);
          const statusData = await statusResponse.json();

          if (statusData.status === 'verified') {
            clearInterval(pollInterval);
            setVerificationStates(prev => ({ ...prev, [providerId]: 'verified' }));
            setProofs(prev => ({ ...prev, [providerId]: statusData.proof }));
            
            // Store Reclaim proof for on-chain verification
            if (statusData.reclaimProof) {
              setReclaimProofs(prev => ({ ...prev, [providerId]: statusData.reclaimProof }));
            }
            
            // Clear the verification URL
            setVerificationUrls(prev => {
              const updated = { ...prev };
              delete updated[providerId];
              return updated;
            });
            setShowQRCodes(prev => ({ ...prev, [providerId]: false }));
            
            if (verificationWindow && !verificationWindow.closed) {
              verificationWindow.close();
            }
          } else if (statusData.status === 'failed') {
            clearInterval(pollInterval);
            setVerificationStates(prev => ({ ...prev, [providerId]: 'failed' }));
            setError(`Verification failed for ${providerId}`);
          }
        } catch (pollError) {
          console.error('Polling error:', pollError);
        }
      }, 3000);

      // Stop polling after 5 minutes
      setTimeout(() => {
        clearInterval(pollInterval);
        if (verificationStates[providerId] === 'loading') {
          setVerificationStates(prev => ({ ...prev, [providerId]: 'timeout' }));
          setError(`Verification timeout for ${providerId}. Please try again.`);
        }
      }, 300000);

    } catch (error) {
      console.error('Verification error:', error);
      setVerificationStates(prev => ({ ...prev, [providerId]: 'failed' }));
      setError(`${error.message}`);
    }
  };

  const mintNFT = async () => {
    if (!walletAddress) {
      setError('Please connect your wallet first');
      return;
    }

    const verifiedProviders = Object.keys(verificationStates).filter(
      key => verificationStates[key] === 'verified'
    );

    if (verifiedProviders.length === 0) {
      setError('Please verify at least one provider before minting');
      return;
    }

    setMintingStatus('Preparing to mint...');
    setError('');

    try {
      if (verificationMode === 'offchain') {
        // Off-chain verification: Backend mints NFT
        const response = await fetch(`${BACKEND_URL}/mint-social-proof-nft`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            walletAddress,
            proofs,
            verifiedProviders,
            mode: 'offchain'
          })
        });

        const result = await response.json();

        if (result.success) {
          setMintingStatus(`Successfully minted off-chain! Token ID: ${result.tokenId}`);
          setNftMinted(true);
        } else {
          setError(result.error || 'Minting failed. Please try again.');
          setMintingStatus('');
        }
      } else {
        // On-chain verification: Submit proofs directly to contract
        setMintingStatus('Preparing on-chain verification...');
        
        const response = await fetch(`${BACKEND_URL}/prepare-onchain-mint`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            walletAddress,
            reclaimProofs,
            verifiedProviders
          })
        });

        const { transformedProofs } = await response.json();

        // Interact with smart contract directly
        const provider = new ethers.BrowserProvider(window.ethereum);
        const signer = await provider.getSigner();
        
        // Simplified ABI for the function we need
        const contractABI = [
          "function mintWithProofVerification(tuple(tuple(string provider, string parameters, string context) claimInfo, tuple(tuple(bytes32 identifier, address owner, uint32 timestampS, uint32 epoch) claim, bytes[] signatures) signedClaim)[] proofs, string[] providers) external returns (uint256)",
          "event SocialProofPassMinted(address indexed to, uint256 indexed tokenId, string[] providers, uint256 timestamp)"
        ];
        
        const contract = new ethers.Contract(CONTRACT_ADDRESS, contractABI, signer);

        setMintingStatus('Please confirm transaction in your wallet...');
        
        const tx = await contract.mintWithProofVerification(
          transformedProofs,
          verifiedProviders
        );

        setMintingStatus('Transaction submitted! Waiting for confirmation...');
        
        const receipt = await tx.wait();
        
        // Extract token ID from event
        const event = receipt.logs?.find(log => {
          try {
            const decoded = contract.interface.parseLog(log);
            return decoded.name === 'SocialProofPassMinted';
          } catch {
            return false;
          }
        });
        
        const tokenId = event ? 
          contract.interface.parseLog(event).args.tokenId.toString() : 
          'N/A';

        setMintingStatus(`Successfully minted on-chain! Token ID: ${tokenId}`);
        setNftMinted(true);
      }
    } catch (error) {
      console.error('Minting error:', error);
      setError(`Minting failed: ${error.message}`);
      setMintingStatus('');
    }
  };

  const verifiedCount = Object.values(verificationStates).filter(s => s === 'verified').length;
  const progress = selectedProviders.length > 0 ? (verifiedCount / selectedProviders.length) * 100 : 0;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 p-6">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="text-center mb-12">
          <div className="flex items-center justify-center mb-4">
            <Shield className="w-16 h-16 text-yellow-400" />
          </div>
          <h1 className="text-5xl font-bold text-white mb-4">Social Proof Pass</h1>
          <p className="text-xl text-purple-200">Verify your identity across platforms with zkTLS</p>
          <p className="text-sm text-purple-300 mt-2">Zero-knowledge proof verification • Privacy preserved • NFT certification</p>
        </div>

        {/* Configuration Status */}
        {configStatus && !configStatus.hasAnyConfigured && (
          <Alert className="mb-6 border-yellow-500 bg-yellow-500/10">
            <Settings className="h-4 w-4 text-yellow-500" />
            <AlertDescription className="text-yellow-200">
              <div className="space-y-2">
                <p><strong>Setup Required:</strong> No Reclaim Protocol providers are configured.</p>
                <p>To enable verification, please:</p>
                <ol className="list-decimal list-inside text-sm space-y-1 ml-4">
                  <li>Visit <a href="https://dev.reclaimprotocol.org/" target="_blank" rel="noopener noreferrer" className="underline text-yellow-300">Reclaim Developer Portal</a></li>
                  <li>Create an application and get your credentials</li>
                  <li>Update the backend .env file with your App ID, Secret, and Provider ID</li>
                  <li>Restart the backend server</li>
                </ol>
              </div>
            </AlertDescription>
          </Alert>
        )}

        {/* Error Alert */}
        {error && (
          <Alert className="mb-6 border-red-500 bg-red-500/10">
            <AlertCircle className="h-4 w-4 text-red-500" />
            <AlertDescription className="text-red-200">
              {error}
            </AlertDescription>
          </Alert>
        )}

        {/* Wallet Connection */}
        <Card className="mb-8 bg-white/10 border-white/20 backdrop-blur-sm">
          <CardHeader>
            <CardTitle className="text-white">Wallet Connection</CardTitle>
            <CardDescription className="text-purple-200">
              Connect to mint your Social Proof Pass NFT
              {chainId && (
                <span className="block text-purple-300 text-xs mt-1">
                  Network: {chainId === SEPOLIA_CHAIN_ID ? 'Sepolia Testnet' : `Chain ID ${chainId}`}
                </span>
              )}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {!walletAddress ? (
              <Button
                onClick={connectWallet}
                disabled={isConnecting}
                className="bg-yellow-500 hover:bg-yellow-600 text-gray-900 font-semibold"
              >
                {isConnecting ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Connecting...
                  </>
                ) : (
                  'Connect Wallet'
                )}
              </Button>
            ) : (
              <Badge variant="secondary" className="bg-green-500/20 border-green-500 text-green-300">
                {walletAddress.slice(0, 6)}...{walletAddress.slice(-4)}
              </Badge>
            )}
          </CardContent>
        </Card>

        {/* Verification Mode Selection */}
        {walletAddress && (
          <Card className="mb-8 bg-white/10 border-white/20 backdrop-blur-sm">
            <CardHeader>
              <CardTitle className="text-white">Choose Verification Mode</CardTitle>
              <CardDescription className="text-purple-200">
                Select how you want to verify your proofs
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Card 
                  className={`cursor-pointer transition-all ${
                    verificationMode === 'offchain'
                      ? 'bg-purple-500/20 border-purple-500'
                      : 'bg-white/5 border-white/10 hover:border-white/30'
                  }`}
                  onClick={() => setVerificationMode('offchain')}
                >
                  <CardContent className="p-6">
                    <div className="flex items-center gap-3 mb-3">
                      <Zap className="w-8 h-8 text-purple-400" />
                      <h3 className="text-white font-semibold text-lg">Off-Chain Verification</h3>
                    </div>
                    <p className="text-purple-200 text-sm mb-3">
                      Faster and cheaper. Proofs verified by backend, NFT minted by contract owner.
                    </p>
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 text-xs text-purple-300">
                        <CheckCircle className="w-3 h-3" />
                        <span>Lower gas fees</span>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-purple-300">
                        <CheckCircle className="w-3 h-3" />
                        <span>Faster minting</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card 
                  className={`cursor-pointer transition-all ${
                    verificationMode === 'onchain'
                      ? 'bg-blue-500/20 border-blue-500'
                      : 'bg-white/5 border-white/10 hover:border-white/30'
                  }`}
                  onClick={() => setVerificationMode('onchain')}
                >
                  <CardContent className="p-6">
                    <div className="flex items-center gap-3 mb-3">
                      <Link2 className="w-8 h-8 text-blue-400" />
                      <h3 className="text-white font-semibold text-lg">On-Chain Verification</h3>
                    </div>
                    <p className="text-purple-200 text-sm mb-3">
                      Maximum trust. Proofs verified directly on blockchain using Reclaim Protocol.
                    </p>
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 text-xs text-blue-300">
                        <CheckCircle className="w-3 h-3" />
                        <span>Trustless verification</span>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-blue-300">
                        <CheckCircle className="w-3 h-3" />
                        <span>Fully decentralized</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
              
              <Alert className="mt-4 bg-yellow-500/10 border-yellow-500/30">
                <AlertDescription className="text-yellow-200">
                  <strong>Selected:</strong> {verificationMode === 'offchain' ? 'Off-Chain' : 'On-Chain'} Verification
                </AlertDescription>
              </Alert>
            </CardContent>
          </Card>
        )}

        {/* Provider Selection */}
        <Card className="mb-8 bg-white/10 border-white/20 backdrop-blur-sm">
          <CardHeader>
            <CardTitle className="text-white">Select Platforms to Verify</CardTitle>
            <CardDescription className="text-purple-200">
              Choose which social platforms you want to verify
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {PROVIDERS.map(provider => {
                const Icon = provider.icon;
                const isSelected = selectedProviders.includes(provider.id);
                const state = verificationStates[provider.id];

                return (
                  <Card
                    key={provider.id}
                    className={`cursor-pointer transition-all ${
                      state === 'verified'
                        ? 'bg-green-500/20 border-green-500'
                        : isSelected
                        ? 'bg-white/20 border-yellow-400'
                        : 'bg-white/5 border-white/10 hover:border-white/30'
                    }`}
                    onClick={() => !state && toggleProvider(provider.id)}
                  >
                    <CardContent className="p-6">
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex items-center gap-3">
                          <div className={`${provider.color} p-3 rounded-lg transition-colors`}>
                            <Icon className="w-6 h-6 text-white" />
                          </div>
                          <div>
                            <h3 className="text-white font-semibold text-lg">{provider.name}</h3>
                            <p className="text-purple-200 text-sm">{provider.description}</p>
                          </div>
                        </div>
                        {state === 'verified' && (
                          <CheckCircle className="w-6 h-6 text-green-400" />
                        )}
                      </div>
                      
                      {isSelected && !state && (
                        <div className="space-y-2">
                          <Button
                            onClick={(e) => {
                              e.stopPropagation();
                              startVerification(provider.id);
                            }}
                            className="w-full bg-purple-600 hover:bg-purple-700 text-white"
                            disabled={configStatus && !configStatus.providers[provider.id]?.configured}
                          >
                            {configStatus && !configStatus.providers[provider.id]?.configured 
                              ? `${provider.name} Not Configured` 
                              : 'Start Verification'
                            }
                          </Button>
                          
                          {verificationUrls[provider.id] && (
                            <div className="space-y-2">
                              <div className="flex gap-2">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => setShowQRCodes(prev => ({ ...prev, [provider.id]: !prev[provider.id] }))}
                                  className="flex-1"
                                >
                                  <QrCode className="w-4 h-4 mr-2" />
                                  {showQRCodes[provider.id] ? 'Hide QR' : 'Show QR'}
                                </Button>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => window.open(verificationUrls[provider.id], '_blank')}
                                  className="flex-1"
                                >
                                  <Smartphone className="w-4 h-4 mr-2" />
                                  Open Link
                                </Button>
                              </div>
                              
                              {showQRCodes[provider.id] && (
                                <div className="bg-white p-4 rounded-lg">
                                  <QRCode 
                                    value={verificationUrls[provider.id]} 
                                    size={200}
                                    className="mx-auto"
                                  />
                                  <p className="text-xs text-gray-600 text-center mt-2">
                                    Scan with your mobile device
                                  </p>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      )}

                      {state === 'loading' && (
                        <div className="flex items-center justify-center gap-2 mt-2 text-yellow-400">
                          <Loader2 className="w-4 h-4 animate-spin" />
                          <span className="text-sm">Verifying...</span>
                        </div>
                      )}

                      {(state === 'failed' || state === 'timeout') && (
                        <Button
                          onClick={(e) => {
                            e.stopPropagation();
                            setVerificationStates(prev => {
                              const newState = { ...prev };
                              delete newState[provider.id];
                              return newState;
                            });
                            startVerification(provider.id);
                          }}
                          variant="destructive"
                          className="w-full mt-2"
                        >
                          Retry Verification
                        </Button>
                      )}

                      {state === 'verified' && (
                        <div className="bg-green-500/20 text-green-300 text-center py-2 rounded-lg mt-2 text-sm font-medium">
                          ✓ Verified Successfully
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
            
            {selectedProviders.length > 0 && (
              <div className="mt-6">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-white text-sm">Verification Progress</span>
                  <span className="text-purple-300 text-sm">{verifiedCount}/{selectedProviders.length}</span>
                </div>
                <Progress value={progress} className="h-2" />
              </div>
            )}
          </CardContent>
        </Card>

        {/* NFT Minting Section */}
        {verifiedCount > 0 && (
          <Card className="bg-gradient-to-r from-yellow-500/20 to-pink-500/20 border-yellow-500/50 backdrop-blur-sm">
            <CardHeader>
              <div className="flex items-center gap-3">
                <Award className="w-8 h-8 text-yellow-400" />
                <CardTitle className="text-white">Mint Your Social Proof Pass</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center mb-6">
                <div>
                  <div className="text-3xl font-bold text-yellow-400">{verifiedCount}</div>
                  <div className="text-purple-200 text-sm">Verified</div>
                </div>
                <div>
                  <div className="text-3xl font-bold text-purple-400">{selectedProviders.length}</div>
                  <div className="text-purple-200 text-sm">Selected</div>
                </div>
                <div>
                  <div className="text-3xl font-bold text-pink-400">{verifiedCount > 0 ? '✓' : '○'}</div>
                  <div className="text-purple-200 text-sm">Ready</div>
                </div>
                <div>
                  <div className="text-3xl font-bold text-green-400">{nftMinted ? '✓' : '○'}</div>
                  <div className="text-purple-200 text-sm">Minted</div>
                </div>
              </div>

              {!nftMinted ? (
                <Button
                  onClick={mintNFT}
                  disabled={!walletAddress || verifiedCount === 0}
                  className="w-full bg-gradient-to-r from-yellow-500 to-pink-500 hover:from-yellow-600 hover:to-pink-600 text-white font-bold text-lg py-6"
                >
                  {!walletAddress ? 'Connect Wallet to Mint' : (
                    <>
                      {verificationMode === 'onchain' && <Link2 className="w-5 h-5 mr-2" />}
                      {verificationMode === 'offchain' && <Zap className="w-5 h-5 mr-2" />}
                      Mint Social Proof Pass ({verificationMode === 'onchain' ? 'On-Chain' : 'Off-Chain'})
                    </>
                  )}
                </Button>
              ) : (
                <Card className="bg-green-500/20 border-green-500">
                  <CardContent className="p-6 text-center">
                    <CheckCircle className="w-16 h-16 text-green-400 mx-auto mb-4" />
                    <h3 className="text-2xl font-bold text-white mb-2">NFT Minted Successfully!</h3>
                    <p className="text-green-300">{mintingStatus}</p>
                    <Badge className="mt-4 bg-green-500/30 text-green-200">
                      Contract: {CONTRACT_ADDRESS}
                    </Badge>
                  </CardContent>
                </Card>
              )}

              {mintingStatus && !nftMinted && (
                <div className="mt-4 text-center text-yellow-300 flex items-center justify-center gap-2">
                  <Loader2 className="w-5 h-5 animate-spin" />
                  {mintingStatus}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Info Section */}
        <Card className="mt-8 bg-white/5 border-white/10 backdrop-blur-sm">
          <CardHeader>
            <CardTitle className="text-white text-lg">How it works</CardTitle>
          </CardHeader>
          <CardContent>
            <ol className="text-purple-200 space-y-2 text-sm">
              <li>1. Connect your Web3 wallet to Sepolia testnet</li>
              <li>2. Choose verification mode (Off-Chain or On-Chain)</li>
              <li>3. Select social platforms you want to verify</li>
              <li>4. Complete zkTLS verification (privacy-preserving)</li>
              <li>5. Mint your unique Social Proof Pass NFT</li>
              <li>6. Use your NFT as verifiable social proof on-chain</li>
            </ol>
            
            <div className="mt-4 pt-4 border-t border-white/10">
              <h4 className="text-white font-semibold mb-2 text-sm">Verification Modes:</h4>
              <div className="space-y-2 text-xs text-purple-200">
                <div className="flex items-start gap-2">
                  <Zap className="w-4 h-4 text-purple-400 mt-0.5 flex-shrink-0" />
                  <div>
                    <strong className="text-white">Off-Chain:</strong> Proofs verified by backend, faster and cheaper minting
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <Link2 className="w-4 h-4 text-blue-400 mt-0.5 flex-shrink-0" />
                  <div>
                    <strong className="text-white">On-Chain:</strong> Proofs verified directly on blockchain using Reclaim Protocol smart contracts
                  </div>
                </div>
              </div>
            </div>
            
            <div className="mt-4 pt-4 border-t border-white/10">
              <h4 className="text-white font-semibold mb-2 text-sm">Contract Details:</h4>
              <div className="text-xs text-purple-200">
                <p><strong>Network:</strong> Sepolia Testnet</p>
                <p><strong>Contract:</strong> <span className="font-mono text-yellow-300">{CONTRACT_ADDRESS}</span></p>
                <p><strong>Reclaim Protocol:</strong> <span className="font-mono text-blue-300">0xAe94FB09711e1c6B057853a515483792d8e474d0</span></p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default App;
