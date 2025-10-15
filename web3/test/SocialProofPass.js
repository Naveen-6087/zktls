const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("SocialProofPass", function () {
  let socialProofPass;
  let owner;
  let addr1;
  let addr2;

  beforeEach(async function () {
    // Get the ContractFactory and Signers here.
    [owner, addr1, addr2] = await ethers.getSigners();

    // Deploy the contract
    const SocialProofPass = await ethers.getContractFactory("SocialProofPass");
    socialProofPass = await SocialProofPass.deploy();
    // Remove .deployed() call for newer hardhat versions
  });

  describe("Deployment", function () {
    it("Should set the right owner", async function () {
      expect(await socialProofPass.owner()).to.equal(owner.address);
    });

    it("Should have correct name and symbol", async function () {
      expect(await socialProofPass.name()).to.equal("SocialProofPass");
      expect(await socialProofPass.symbol()).to.equal("SPP");
    });

    it("Should initialize supported providers", async function () {
      expect(await socialProofPass.supportedProviders("github")).to.be.true;
      expect(await socialProofPass.supportedProviders("gmail")).to.be.true;
      expect(await socialProofPass.supportedProviders("linkedin")).to.be.true;
      expect(await socialProofPass.supportedProviders("twitter")).to.be.true;
    });

    it("Should set correct Reclaim Protocol address", async function () {
      const reclaimAddress = await socialProofPass.getReclaimAddress();
      expect(reclaimAddress).to.equal("0xAe94FB09711e1c6B057853a515483792d8e474d0");
    });
  });

  describe("Minting", function () {
    it("Should mint NFT through backend (off-chain verification)", async function () {
      const providers = ["github", "gmail"];
      const proofData = "0x1234"; // Mock proof data
      
      // Mint NFT
      await socialProofPass.mintSocialProofPass(addr1.address, providers, proofData);
      
      // Check token was minted
      expect(await socialProofPass.balanceOf(addr1.address)).to.equal(1);
      expect(await socialProofPass.ownerOf(0)).to.equal(addr1.address);
      
      // Check social proof data
      const proof = await socialProofPass.getSocialProof(0);
      expect(proof.holder).to.equal(addr1.address);
      expect(proof.verifiedProviders).to.deep.equal(providers);
      expect(proof.verificationCount).to.equal(2);
      expect(proof.verified).to.be.true;
    });

    it("Should prevent double minting", async function () {
      const providers = ["github"];
      const proofData = "0x1234";
      
      // First mint should succeed
      await socialProofPass.mintSocialProofPass(addr1.address, providers, proofData);
      
      // Second mint should fail
      await expect(
        socialProofPass.mintSocialProofPass(addr1.address, providers, proofData)
      ).to.be.revertedWith("Already minted");
    });

    it("Should only allow owner to mint (off-chain)", async function () {
      const providers = ["github"];
      const proofData = "0x1234";
      
      await expect(
        socialProofPass.connect(addr1).mintSocialProofPass(addr2.address, providers, proofData)
      ).to.be.revertedWith("Ownable: caller is not the owner");
    });
  });

  describe("Provider Management", function () {
    it("Should allow owner to add supported provider", async function () {
      await socialProofPass.addSupportedProvider("discord");
      expect(await socialProofPass.supportedProviders("discord")).to.be.true;
    });

    it("Should allow owner to remove supported provider", async function () {
      await socialProofPass.removeSupportedProvider("github");
      expect(await socialProofPass.supportedProviders("github")).to.be.false;
    });

    it("Should not allow non-owner to manage providers", async function () {
      await expect(
        socialProofPass.connect(addr1).addSupportedProvider("discord")
      ).to.be.revertedWith("Ownable: caller is not the owner");
    });
  });

  describe("Token URI", function () {
    it("Should generate token URI for minted token", async function () {
      const providers = ["github", "gmail"];
      const proofData = "0x1234";
      
      await socialProofPass.mintSocialProofPass(addr1.address, providers, proofData);
      
      const tokenURI = await socialProofPass.tokenURI(0);
      expect(tokenURI).to.include("data:application/json,");
      
      // Parse the JSON directly (no base64 decoding needed)
      const jsonString = tokenURI.substring("data:application/json,".length);
      const metadata = JSON.parse(jsonString);
      
      expect(metadata.name).to.include("Social Proof Pass #0");
      expect(metadata.description).to.include("zkTLS");
      expect(metadata.attributes).to.be.an('array');
      expect(metadata.attributes.some(attr => attr.trait_type === "Count" && attr.value === 2)).to.be.true;
    });
  });

  describe("Reclaim Address Management", function () {
    it("Should allow owner to update Reclaim address", async function () {
      const newAddress = "0x1234567890123456789012345678901234567890";
      await socialProofPass.updateReclaimAddress(newAddress);
      expect(await socialProofPass.getReclaimAddress()).to.equal(newAddress);
    });

    it("Should not allow non-owner to update Reclaim address", async function () {
      const newAddress = "0x1234567890123456789012345678901234567890";
      await expect(
        socialProofPass.connect(addr1).updateReclaimAddress(newAddress)
      ).to.be.revertedWith("Ownable: caller is not the owner");
    });
  });
});