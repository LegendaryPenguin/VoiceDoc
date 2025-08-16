// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

// inspiration from: https://www.circle.com/blog/refund-protocol-non-custodial-dispute-resolution-for-stablecoin-payments

// @notice ERC-20 interface (USDC-compatible)
interface IERC20 {
    function balanceOf(address) external view returns (uint256);
    function allowance(address owner, address spender) external view returns (uint256);
    function approve(address spender, uint256 value) external returns (bool);
    function transfer(address to, uint256 value) external returns (bool);
    function transferFrom(address from, address to, uint256 value) external returns (bool);
    function decimals() external view returns (uint8);
    function symbol() external view returns (string memory);
}

contract EscrowUSDCContract {
    // ---- Network hardcodes (Polygon Amoy) ----
    uint256 internal constant CHAIN_ID_AMOY = 80002;
    address  public constant USDC_AMOY      = 0x41E94Eb019C0762f9Bfcf9Fb1E58725BfB0e7582;

    // ---- Types & State ----
    enum Stage { OPEN, FUNDED, RELEASED, REFUNDED }

    IERC20  public immutable usdc;
    address public immutable depositor;
    address public immutable beneficiary;
    uint256 public immutable amount;   // 6 decimals (5 USDC = 5_000_000)
    Stage   public stage;

    bool public depositorReleaseOk;
    bool public beneficiaryReleaseOk;
    bool public depositorRefundOk;
    bool public beneficiaryRefundOk;

    // Simple reentrancy guard for external functions
    bool private _locked;
    modifier nonReentrant() {
        require(!_locked, "ERR:REENTRANCY");
        _locked = true;
        _;
        _locked = false;
    }

    // ---- Events ----
    event StageChanged(Stage stage);
    event Deposited(uint256 amount);
    event Released(uint256 amount);
    event Refunded(uint256 amount);
    event ReleaseApproved(address by);
    event RefundApproved(address by);

    constructor(address _depositor, address _beneficiary, uint256 _amount) {
        require(block.chainid == CHAIN_ID_AMOY, "ERR:WRONG_CHAIN");
        require(_depositor != address(0) && _beneficiary != address(0), "ERR:ZERO_ADDR");
        require(_amount > 0, "ERR:AMOUNT_ZERO");

        usdc       = IERC20(USDC_AMOY);
        depositor  = _depositor;
        beneficiary= _beneficiary;
        amount     = _amount;

        stage = Stage.OPEN;
        emit StageChanged(stage);
    }

    /// @notice Depositor funds the escrow (requires allowance >= amount).
    function deposit() external nonReentrant {
        require(msg.sender == depositor, "ERR:NOT_DEPOSITOR");
        require(stage == Stage.OPEN, "ERR:BAD_STAGE");
        require(usdc.balanceOf(depositor) >= amount, "ERR:LOW_BAL");
        require(usdc.allowance(depositor, address(this)) >= amount, "ERR:LOW_ALLOW");

        // Pull in funds
        bool ok = usdc.transferFrom(depositor, address(this), amount);
        require(ok, "ERR:XFERFROM_FAIL");

        stage = Stage.FUNDED;
        emit StageChanged(stage);
        emit Deposited(amount);
    }

    /// @notice Each party approves releasing to beneficiary (2-of-2).
    function approveRelease() external {
        require(stage == Stage.FUNDED, "ERR:BAD_STAGE");

        if (msg.sender == depositor) {
            require(!depositorReleaseOk, "ERR:ALREADY_DEP_REL");
            depositorReleaseOk = true;
        } else if (msg.sender == beneficiary) {
            require(!beneficiaryReleaseOk, "ERR:ALREADY_BEN_REL");
            beneficiaryReleaseOk = true;
        } else {
            revert("ERR:BAD_CALLER");
        }

        emit ReleaseApproved(msg.sender);

        if (depositorReleaseOk && beneficiaryReleaseOk) {
            _release();
        }
    }

    /// @notice Each party approves refunding to depositor (2-of-2).
    function approveRefund() external {
        require(stage == Stage.FUNDED, "ERR:BAD_STAGE");

        if (msg.sender == depositor) {
            require(!depositorRefundOk, "ERR:ALREADY_DEP_REF");
            depositorRefundOk = true;
        } else if (msg.sender == beneficiary) {
            require(!beneficiaryRefundOk, "ERR:ALREADY_BEN_REF");
            beneficiaryRefundOk = true;
        } else {
            revert("ERR:BAD_CALLER");
        }

        emit RefundApproved(msg.sender);

        if (depositorRefundOk && beneficiaryRefundOk) {
            _refund();
        }
    }

    // ---- Internal actions ----
    function _release() internal {
        stage = Stage.RELEASED;
        emit StageChanged(stage);
        require(usdc.transfer(beneficiary, amount), "ERR:XFER_FAIL");
        emit Released(amount);
    }

    function _refund() internal {
        stage = Stage.REFUNDED;
        emit StageChanged(stage);
        require(usdc.transfer(depositor, amount), "ERR:XFER_FAIL");
        emit Refunded(amount);
    }

    // ---- Views ----
    function balance() external view returns (uint256) {
        return usdc.balanceOf(address(this));
    }
}