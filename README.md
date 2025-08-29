# 🌋 Transparent Geothermal Energy Leasing Platform

Welcome to a revolutionary blockchain-based platform that brings transparency and trust to geothermal energy leasing! This project addresses real-world challenges in the renewable energy sector, such as opaque lease agreements, disputes over resource extraction volumes, inaccurate usage reporting, and delayed payments. By leveraging the Stacks blockchain and Clarity smart contracts, we enable immutable logging of resource usage, automated verifications, and fair, transparent transactions between lessors (land/resource owners) and lessees (energy companies). Data from IoT sensors or trusted oracles can be fed into the blockchain for verifiable records, reducing fraud and ensuring compliance with environmental regulations.

## ✨ Features

🔒 Secure lease creation with digital signatures and immutable terms  
📊 Immutable logging of geothermal resource usage (e.g., heat extraction volumes, water usage)  
✅ Automated verification of usage against lease agreements  
💰 Usage-based payments via escrow, triggered by verified logs  
⚖️ Built-in dispute resolution mechanism  
🌍 Environmental compliance tracking with verifiable audits  
📈 Tokenized lease ownership for easy transfer or fractionalization  
🚫 Prevention of over-extraction through smart limits  
🔄 Integration with oracles for real-time data input  

## 🛠 How It Works

**For Lessors (Resource Owners)**  
- Register your profile and resources.  
- Create a lease offer with terms like duration, extraction limits, and pricing per unit of usage.  
- Once a lessee accepts, the lease is deployed as a smart contract, and usage logging begins.  
- Monitor immutable logs and receive automated payments based on verified extraction data.  

**For Lessees (Energy Companies)**  
- Browse available leases and accept terms.  
- Submit usage data (e.g., via oracles or manual entry with proofs) to the logger contract.  
- Trigger verifications to confirm compliance and release payments.  
- Resolve disputes by submitting evidence to the arbitration contract.  

**For Verifiers/Auditors**  
- Query lease details and usage logs.  
- Use verification functions to check against predefined rules (e.g., no over-extraction).  
- Access compliance reports for regulatory purposes.  

All interactions are powered by 8 Clarity smart contracts, ensuring decentralization and security on the Stacks blockchain. Usage data is hashed and timestamped for immutability, solving trust issues in traditional leasing systems.

## 📂 Smart Contracts Overview

This project involves 8 smart contracts written in Clarity, each handling a specific aspect of the platform:

1. **UserRegistry.clar**: Manages user registrations, profiles, and roles (lessors, lessees, auditors). Ensures only verified parties can participate.  
2. **LeaseFactory.clar**: Creates new lease agreements as dynamic contracts, defining terms like duration, pricing, and extraction caps.  
3. **UsageLogger.clar**: Records immutable logs of resource usage (e.g., volume extracted, timestamps) submitted via oracles or authenticated users.  
4. **VerificationEngine.clar**: Automates checks on logged data against lease terms, flagging violations like over-extraction.  
5. **PaymentEscrow.clar**: Holds funds in escrow and releases payments based on successful verifications, using STX or SIP-10 tokens.  
6. **LeaseToken.clar**: Issues NFTs representing lease ownership, enabling transfer, sale, or fractionalization.  
7. **DisputeResolution.clar**: Handles disputes with evidence submission, voting by stakeholders, and automated rulings.  
8. **ComplianceTracker.clar**: Monitors environmental metrics (e.g., reinjection rates) and generates verifiable reports for regulators.  

## 🚀 Getting Started

1. Install the Clarinet SDK for Clarity development.  
2. Clone this repo and deploy the contracts to a Stacks testnet.  
3. Use the provided scripts to simulate lease creation, logging, and verification.  
4. Integrate with external oracles (e.g., for IoT data) to feed real-world usage metrics.  

This platform not only streamlines geothermal leasing but also promotes sustainable energy practices by making over-exploitation detectable and punishable on-chain. Let's heat up the future of renewables! 🌟