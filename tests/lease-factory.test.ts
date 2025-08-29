// tests/LeaseFactory.test.ts
import { describe, expect, it, vi, beforeEach } from "vitest";

// Interfaces for type safety
interface ClarityResponse<T> {
  ok: boolean;
  value: T | number; // number for error codes
}

interface Lease {
  lessor: string;
  lessee: string | null;
  startBlock: number;
  durationBlocks: number;
  extractionCap: number;
  resourceType: number;
  pricePerUnit: number;
  state: number;
  envConstraints: Array<{ metric: string; maxValue: number }>;
  metadata: string;
}

interface LeaseUsage {
  currentExtraction: number;
  lastLogBlock: number;
  pendingPayments: number;
}

interface LeaseAuditor {
  addedAt: number;
  permissions: string[];
}

interface ConstraintCheck {
  found: boolean;
  compliant: boolean;
  target: number;
  metric: string;
}

interface ContractState {
  nextLeaseId: number;
  admin: string;
  oraclePrincipal: string;
  leases: Map<number, Lease>;
  leaseUsage: Map<number, LeaseUsage>;
  leaseAuditors: Map<string, LeaseAuditor>; // Key: `${leaseId}-${auditor}`
}

// Mock contract implementation
class LeaseFactoryMock {
  private state: ContractState = {
    nextLeaseId: 0,
    admin: "deployer",
    oraclePrincipal: "deployer",
    leases: new Map(),
    leaseUsage: new Map(),
    leaseAuditors: new Map(),
  };

  private ERR_UNAUTHORIZED = 100;
  private ERR_INVALID_PARAMS = 101;
  private ERR_LEASE_EXISTS = 102;
  private ERR_LEASE_NOT_FOUND = 103;
  private ERR_LEASE_NOT_ACTIVE = 104;
  private ERR_INVALID_STATE = 105;
  private ERR_EXTRACTION_CAP_EXCEEDED = 106;
  private ERR_INVALID_DURATION = 107;
  private ERR_INVALID_PRICING = 108;
  private ERR_NOT_LESSOR = 109;
  private ERR_NOT_LESSEE = 110;
  private ERR_ALREADY_ACCEPTED = 111;
  private ERR_LEASE_EXPIRED = 112;
  private ERR_INVALID_RESOURCE_TYPE = 113;
  private ERR_MAX_ENV_CONSTRAINTS = 114;
  private ERR_INVALID_ORACLE = 115;

  private LEASE_STATE_PENDING = 0;
  private LEASE_STATE_ACTIVE = 1;
  private LEASE_STATE_EXPIRED = 2;
  private LEASE_STATE_TERMINATED = 3;

  private RESOURCE_TYPE_HEAT = 1;
  private RESOURCE_TYPE_WATER = 2;
  private RESOURCE_TYPE_POWER = 3;

  private MAX_ENV_CONSTRAINTS = 5;
  private MAX_DURATION_BLOCKS = 1051200;
  private MIN_DURATION_BLOCKS = 144;

  private currentBlockHeight = 1000; // Mock block height

  // Helper to simulate block height increase
  advanceBlock() {
    this.currentBlockHeight += 1;
  }

  private isAdmin(caller: string): boolean {
    return caller === this.state.admin;
  }

  private isLessor(leaseId: number, caller: string): boolean {
    const lease = this.state.leases.get(leaseId);
    return !!lease && lease.lessor === caller;
  }

  private isLessee(leaseId: number, caller: string): boolean {
    const lease = this.state.leases.get(leaseId);
    return !!lease && lease.lessee === caller;
  }

  private validateDuration(duration: number): boolean {
    return duration >= this.MIN_DURATION_BLOCKS && duration <= this.MAX_DURATION_BLOCKS;
  }

  private validateResourceType(resource: number): boolean {
    return [this.RESOURCE_TYPE_HEAT, this.RESOURCE_TYPE_WATER, this.RESOURCE_TYPE_POWER].includes(resource);
  }

  private validateEnvConstraints(constraints: Array<{ metric: string; maxValue: number }>): boolean {
    return constraints.length <= this.MAX_ENV_CONSTRAINTS;
  }

  createLease(
    caller: string,
    duration: number,
    extractionCap: number,
    resourceType: number,
    pricePerUnit: number,
    envConstraints: Array<{ metric: string; maxValue: number }>,
    metadata: string
  ): ClarityResponse<number> {
    if (!this.validateDuration(duration)) {
      return { ok: false, value: this.ERR_INVALID_DURATION };
    }
    if (extractionCap <= 0) {
      return { ok: false, value: this.ERR_INVALID_PARAMS };
    }
    if (!this.validateResourceType(resourceType)) {
      return { ok: false, value: this.ERR_INVALID_RESOURCE_TYPE };
    }
    if (pricePerUnit <= 0) {
      return { ok: false, value: this.ERR_INVALID_PRICING };
    }
    if (!this.validateEnvConstraints(envConstraints)) {
      return { ok: false, value: this.ERR_MAX_ENV_CONSTRAINTS };
    }

    const leaseId = this.state.nextLeaseId;
    this.state.nextLeaseId += 1;

    this.state.leases.set(leaseId, {
      lessor: caller,
      lessee: null,
      startBlock: this.currentBlockHeight,
      durationBlocks: duration,
      extractionCap,
      resourceType,
      pricePerUnit,
      state: this.LEASE_STATE_PENDING,
      envConstraints,
      metadata,
    });

    this.state.leaseUsage.set(leaseId, {
      currentExtraction: 0,
      lastLogBlock: this.currentBlockHeight,
      pendingPayments: 0,
    });

    return { ok: true, value: leaseId };
  }

  acceptLease(caller: string, leaseId: number): ClarityResponse<boolean> {
    const lease = this.state.leases.get(leaseId);
    if (!lease) {
      return { ok: false, value: this.ERR_LEASE_NOT_FOUND };
    }
    if (lease.state !== this.LEASE_STATE_PENDING) {
      return { ok: false, value: this.ERR_INVALID_STATE };
    }
    if (lease.lessee !== null) {
      return { ok: false, value: this.ERR_ALREADY_ACCEPTED };
    }

    lease.lessee = caller;
    lease.startBlock = this.currentBlockHeight;
    lease.state = this.LEASE_STATE_ACTIVE;
    this.state.leases.set(leaseId, lease);

    return { ok: true, value: true };
  }

  terminateLease(caller: string, leaseId: number): ClarityResponse<boolean> {
    const lease = this.state.leases.get(leaseId);
    if (!lease) {
      return { ok: false, value: this.ERR_LEASE_NOT_FOUND };
    }
    if (!this.isLessor(leaseId, caller) && !this.isAdmin(caller)) {
      return { ok: false, value: this.ERR_UNAUTHORIZED };
    }
    if (lease.state !== this.LEASE_STATE_ACTIVE) {
      return { ok: false, value: this.ERR_LEASE_NOT_ACTIVE };
    }

    lease.state = this.LEASE_STATE_TERMINATED;
    this.state.leases.set(leaseId, lease);

    return { ok: true, value: true };
  }

  logExtraction(caller: string, leaseId: number, amount: number): ClarityResponse<boolean> {
    const lease = this.state.leases.get(leaseId);
    const usage = this.state.leaseUsage.get(leaseId);
    if (!lease || !usage) {
      return { ok: false, value: this.ERR_LEASE_NOT_FOUND };
    }
    if (!this.isLessee(leaseId, caller)) {
      return { ok: false, value: this.ERR_NOT_LESSEE };
    }
    if (lease.state !== this.LEASE_STATE_ACTIVE) {
      return { ok: false, value: this.ERR_LEASE_NOT_ACTIVE };
    }
    if (usage.currentExtraction + amount > lease.extractionCap) {
      return { ok: false, value: this.ERR_EXTRACTION_CAP_EXCEEDED };
    }
    if (this.currentBlockHeight >= lease.startBlock + lease.durationBlocks) {
      return { ok: false, value: this.ERR_LEASE_EXPIRED };
    }

    const paymentDue = amount * lease.pricePerUnit;
    usage.currentExtraction += amount;
    usage.lastLogBlock = this.currentBlockHeight;
    usage.pendingPayments += paymentDue;
    this.state.leaseUsage.set(leaseId, usage);

    return { ok: true, value: true };
  }

  addAuditor(caller: string, leaseId: number, auditor: string, permissions: string[]): ClarityResponse<boolean> {
    const lease = this.state.leases.get(leaseId);
    if (!lease) {
      return { ok: false, value: this.ERR_LEASE_NOT_FOUND };
    }
    if (!this.isLessor(leaseId, caller)) {
      return { ok: false, value: this.ERR_NOT_LESSOR };
    }

    const key = `${leaseId}-${auditor}`;
    this.state.leaseAuditors.set(key, {
      addedAt: this.currentBlockHeight,
      permissions,
    });

    return { ok: true, value: true };
  }

  updateOracle(caller: string, newOracle: string): ClarityResponse<boolean> {
    if (!this.isAdmin(caller)) {
      return { ok: false, value: this.ERR_UNAUTHORIZED };
    }
    this.state.oraclePrincipal = newOracle;
    return { ok: true, value: true };
  }

  oracleLogExtraction(caller: string, leaseId: number, amount: number): ClarityResponse<boolean> {
    if (caller !== this.state.oraclePrincipal) {
      return { ok: false, value: this.ERR_INVALID_ORACLE };
    }
    // Rest same as logExtraction but without lessee check
    const lease = this.state.leases.get(leaseId);
    const usage = this.state.leaseUsage.get(leaseId);
    if (!lease || !usage) {
      return { ok: false, value: this.ERR_LEASE_NOT_FOUND };
    }
    if (lease.state !== this.LEASE_STATE_ACTIVE) {
      return { ok: false, value: this.ERR_LEASE_NOT_ACTIVE };
    }
    if (usage.currentExtraction + amount > lease.extractionCap) {
      return { ok: false, value: this.ERR_EXTRACTION_CAP_EXCEEDED };
    }
    if (this.currentBlockHeight >= lease.startBlock + lease.durationBlocks) {
      return { ok: false, value: this.ERR_LEASE_EXPIRED };
    }

    const paymentDue = amount * lease.pricePerUnit;
    usage.currentExtraction += amount;
    usage.lastLogBlock = this.currentBlockHeight;
    usage.pendingPayments += paymentDue;
    this.state.leaseUsage.set(leaseId, usage);

    return { ok: true, value: true };
  }

  getLeaseDetails(leaseId: number): ClarityResponse<Lease | null> {
    return { ok: true, value: this.state.leases.get(leaseId) ?? null };
  }

  getLeaseUsage(leaseId: number): ClarityResponse<LeaseUsage | null> {
    return { ok: true, value: this.state.leaseUsage.get(leaseId) ?? null };
  }

  getLeaseAuditor(leaseId: number, auditor: string): ClarityResponse<LeaseAuditor | null> {
    const key = `${leaseId}-${auditor}`;
    return { ok: true, value: this.state.leaseAuditors.get(key) ?? null };
  }

  getNextLeaseId(): ClarityResponse<number> {
    return { ok: true, value: this.state.nextLeaseId };
  }

  getOracle(): ClarityResponse<string> {
    return { ok: true, value: this.state.oraclePrincipal };
  }

  isLeaseActive(leaseId: number): ClarityResponse<boolean> {
    const lease = this.state.leases.get(leaseId);
    return { ok: true, value: !!lease && lease.state === this.LEASE_STATE_ACTIVE };
  }

  calculatePendingPayment(leaseId: number): ClarityResponse<number> {
    const usage = this.state.leaseUsage.get(leaseId);
    if (!usage) {
      return { ok: false, value: this.ERR_LEASE_NOT_FOUND };
    }
    return { ok: true, value: usage.pendingPayments };
  }

  checkCompliance(leaseId: number, metric: string, value: number): ClarityResponse<ConstraintCheck> {
    const lease = this.state.leases.get(leaseId);
    if (!lease) {
      return { ok: false, value: this.ERR_LEASE_NOT_FOUND };
    }
    let result: ConstraintCheck = { found: false, compliant: false, target: value, metric };
    for (const constraint of lease.envConstraints) {
      if (constraint.metric === metric) {
        result.found = true;
        result.compliant = value <= constraint.maxValue;
        break;
      }
    }
    return { ok: true, value: result };
  }
}

// Test setup
const accounts = {
  deployer: "deployer",
  lessor: "wallet_1",
  lessee: "wallet_2",
  auditor: "wallet_3",
  unauthorized: "wallet_4",
};

describe("LeaseFactory Contract", () => {
  let contract: LeaseFactoryMock;

  beforeEach(() => {
    contract = new LeaseFactoryMock();
    vi.resetAllMocks();
  });

  it("should create a new lease with valid parameters", () => {
    const createResult = contract.createLease(
      accounts.lessor,
      1000,
      5000,
      1, // HEAT
      10,
      [{ metric: "reinjection-rate", maxValue: 90 }],
      "Test lease metadata"
    );
    expect(createResult).toEqual({ ok: true, value: 0 });

    const details = contract.getLeaseDetails(0);
    expect(details.ok).toBe(true);
    expect(details.value).toMatchObject({
      lessor: accounts.lessor,
      lessee: null,
      durationBlocks: 1000,
      extractionCap: 5000,
      resourceType: 1,
      pricePerUnit: 10,
      state: 0, // PENDING
      envConstraints: [{ metric: "reinjection-rate", maxValue: 90 }],
      metadata: "Test lease metadata",
    });

    const usage = contract.getLeaseUsage(0);
    expect(usage.ok).toBe(true);
    expect(usage.value).toMatchObject({
      currentExtraction: 0,
      pendingPayments: 0,
    });
  });

  it("should prevent creating lease with invalid duration", () => {
    const createResult = contract.createLease(
      accounts.lessor,
      100, // Below min
      5000,
      1,
      10,
      [],
      ""
    );
    expect(createResult).toEqual({ ok: false, value: 107 });
  });

  it("should prevent creating lease with invalid resource type", () => {
    const createResult = contract.createLease(
      accounts.lessor,
      1000,
      5000,
      999,
      10,
      [],
      ""
    );
    expect(createResult).toEqual({ ok: false, value: 113 });
  });

  it("should allow lessee to accept pending lease", () => {
    contract.createLease(accounts.lessor, 1000, 5000, 1, 10, [], "");

    const acceptResult = contract.acceptLease(accounts.lessee, 0);
    expect(acceptResult).toEqual({ ok: true, value: true });

    const details = contract.getLeaseDetails(0);
    expect(details.value?.lessee).toBe(accounts.lessee);
    expect(details.value?.state).toBe(1); // ACTIVE
  });

  it("should allow lessor to terminate active lease", () => {
    contract.createLease(accounts.lessor, 1000, 5000, 1, 10, [], "");
    contract.acceptLease(accounts.lessee, 0);

    const terminateResult = contract.terminateLease(accounts.lessor, 0);
    expect(terminateResult).toEqual({ ok: true, value: true });

    const details = contract.getLeaseDetails(0);
    expect(details.value?.state).toBe(3); // TERMINATED
  });

  it("should prevent unauthorized termination", () => {
    contract.createLease(accounts.lessor, 1000, 5000, 1, 10, [], "");
    contract.acceptLease(accounts.lessee, 0);

    const terminateResult = contract.terminateLease(accounts.unauthorized, 0);
    expect(terminateResult).toEqual({ ok: false, value: 100 });
  });

  it("should allow lessee to log extraction", () => {
    contract.createLease(accounts.lessor, 1000, 5000, 1, 10, [], "");
    contract.acceptLease(accounts.lessee, 0);

    const logResult = contract.logExtraction(accounts.lessee, 0, 100);
    expect(logResult).toEqual({ ok: true, value: true });

    const usage = contract.getLeaseUsage(0);
    expect(usage.value?.currentExtraction).toBe(100);
    expect(usage.value?.pendingPayments).toBe(1000); // 100 * 10
  });

  it("should prevent extraction log if cap exceeded", () => {
    contract.createLease(accounts.lessor, 1000, 5000, 1, 10, [], "");
    contract.acceptLease(accounts.lessee, 0);

    contract.logExtraction(accounts.lessee, 0, 5000); // Max
    const exceedResult = contract.logExtraction(accounts.lessee, 0, 1);
    expect(exceedResult).toEqual({ ok: false, value: 106 });
  });

  it("should prevent extraction log if lease expired", () => {
    contract.createLease(accounts.lessor, 1000, 5000, 1, 10, [], "");
    contract.acceptLease(accounts.lessee, 0);

    for (let i = 0; i < 1001; i++) {
      contract.advanceBlock();
    }

    const logResult = contract.logExtraction(accounts.lessee, 0, 100);
    expect(logResult).toEqual({ ok: false, value: 112 });
  });

  it("should allow lessor to add auditor", () => {
    contract.createLease(accounts.lessor, 1000, 5000, 1, 10, [], "");

    const addResult = contract.addAuditor(accounts.lessor, 0, accounts.auditor, ["view-logs", "verify-compliance"]);
    expect(addResult).toEqual({ ok: true, value: true });

    const auditorDetails = contract.getLeaseAuditor(0, accounts.auditor);
    expect(auditorDetails.value?.permissions).toEqual(["view-logs", "verify-compliance"]);
  });

  it("should allow admin to update oracle", () => {
    const updateResult = contract.updateOracle(accounts.deployer, accounts.auditor);
    expect(updateResult).toEqual({ ok: true, value: true });
    expect(contract.getOracle()).toEqual({ ok: true, value: accounts.auditor });
  });

  it("should allow oracle to log extraction", () => {
    contract.createLease(accounts.lessor, 1000, 5000, 1, 10, [], "");
    contract.acceptLease(accounts.lessee, 0);

    const logResult = contract.oracleLogExtraction(accounts.deployer, 0, 200);
    expect(logResult).toEqual({ ok: true, value: true });

    const usage = contract.getLeaseUsage(0);
    expect(usage.value?.currentExtraction).toBe(200);
    expect(usage.value?.pendingPayments).toBe(2000);
  });

  it("should prevent invalid oracle from logging", () => {
    contract.createLease(accounts.lessor, 1000, 5000, 1, 10, [], "");
    contract.acceptLease(accounts.lessee, 0);

    const logResult = contract.oracleLogExtraction(accounts.unauthorized, 0, 100);
    expect(logResult).toEqual({ ok: false, value: 115 });
  });

  it("should check environmental compliance", () => {
    contract.createLease(
      accounts.lessor,
      1000,
      5000,
      1,
      10,
      [{ metric: "reinjection-rate", maxValue: 90 }],
      ""
    );

    const checkCompliant = contract.checkCompliance(0, "reinjection-rate", 80);
    expect(checkCompliant.value).toEqual({
      found: true,
      compliant: true,
      target: 80,
      metric: "reinjection-rate",
    });

    const checkNonCompliant = contract.checkCompliance(0, "reinjection-rate", 95);
    expect(checkNonCompliant.value).toEqual({
      found: true,
      compliant: false,
      target: 95,
      metric: "reinjection-rate",
    });

    const checkUnknown = contract.checkCompliance(0, "unknown-metric", 100);
    expect(checkUnknown.value).toEqual({
      found: false,
      compliant: false,
      target: 100,
      metric: "unknown-metric",
    });
  });

  it("should calculate pending payments", () => {
    contract.createLease(accounts.lessor, 1000, 5000, 1, 10, [], "");
    contract.acceptLease(accounts.lessee, 0);
    contract.logExtraction(accounts.lessee, 0, 300);

    const pending = contract.calculatePendingPayment(0);
    expect(pending).toEqual({ ok: true, value: 3000 });
  });
});