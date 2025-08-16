// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @notice ERC-20 interface (USDC-compatible: returns bool)
interface IERC20 {
    function transfer(address to, uint256 value) external returns (bool);
    function transferFrom(address from, address to, uint256 value) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

contract AgentlessEscrow {
    enum Stage { OPEN, FUNDED, RELEASED, REFUNDED, EXPIRED }

    IERC20  public immutable token;       // e.g., USDC (6 decimals)
    address public immutable depositor;
    address public immutable beneficiary;
    uint256 public immutable amount;      // in token smallest units
    uint64  public immutable deadline;    // unix timestamp

    Stage public stage;

    // 2-of-2 approvals
    bool public depositorReleaseOk;
    bool public beneficiaryReleaseOk;
    bool public depositorRefundOk;
    bool public beneficiaryRefundOk;

    // simple reentrancy guard (no OZ)
    bool private _locked;
    modifier nonReentrant() {
        require(!_locked, "reentrancy");
        _locked = true;
        _;
        _locked = false;
    }

    // Events
    event StageChanged(Stage stage);
    event Deposited(uint256 amount);
    event Released(uint256 amount);
    event Refunded(uint256 amount);
    event ReleaseApproved(address by);
    event RefundApproved(address by);

    error BadCaller();
    error BadStage();
    error DeadlineNotReached();
    error AlreadyApproved();

    constructor(
        address _token,
        address _depositor,
        address _beneficiary,
        uint256 _amount,
        uint64  _deadline   // e.g., uint64(block.timestamp + 7 days)
    ) {
        require(_token != address(0) && _depositor != address(0) && _beneficiary != address(0), "zero addr");
        require(_amount > 0, "amount=0");
        require(_deadline > block.timestamp, "deadline past");

        token = IERC20(_token);
        depositor = _depositor;
        beneficiary = _beneficiary;
        amount = _amount;
        deadline = _deadline;

        stage = Stage.OPEN;
        emit StageChanged(stage);
    }

    /// @notice Depositor pulls funds into escrow after granting allowance
    function deposit() external nonReentrant {
        if (msg.sender != depositor) revert BadCaller();
        if (stage != Stage.OPEN) revert BadStage();

        // Effects before interaction where possible
        stage = Stage.FUNDED;
        emit StageChanged(stage);

        // Pull funds into the contract
        bool ok = token.transferFrom(depositor, address(this), amount);
        require(ok, "transferFrom failed");

        emit Deposited(amount);
    }

    /// @notice Each party approves releasing to beneficiary (2-of-2)
    function approveRelease() external {
        if (stage != Stage.FUNDED) revert BadStage();

        if (msg.sender == depositor) {
            if (depositorReleaseOk) revert AlreadyApproved();
            depositorReleaseOk = true;
        } else if (msg.sender == beneficiary) {
            if (beneficiaryReleaseOk) revert AlreadyApproved();
            beneficiaryReleaseOk = true;
        } else {
            revert BadCaller();
        }
        emit ReleaseApproved(msg.sender);

        if (depositorReleaseOk && beneficiaryReleaseOk) {
            _release();
        }
    }

    /// @notice Each party can approve refund (2-of-2)
    function approveRefund() external {
        if (stage != Stage.FUNDED && stage != Stage.OPEN) revert BadStage();

        if (msg.sender == depositor) {
            if (depositorRefundOk) revert AlreadyApproved();
            depositorRefundOk = true;
        } else if (msg.sender == beneficiary) {
            if (beneficiaryRefundOk) revert AlreadyApproved();
            beneficiaryRefundOk = true;
        } else {
            revert BadCaller();
        }
        emit RefundApproved(msg.sender);

        if (stage == Stage.FUNDED && depositorRefundOk && beneficiaryRefundOk) {
            _refund();
        }
    }

    /// @notice After deadline, depositor can unilaterally refund if funds still locked
    function refundAfterDeadline() external nonReentrant {
        if (msg.sender != depositor) revert BadCaller();
        if (stage != Stage.FUNDED) revert BadStage();
        if (block.timestamp < deadline) revert DeadlineNotReached();

        // Mark expired to prevent reentrancy into release path
        stage = Stage.EXPIRED;
        emit StageChanged(stage);

        _refund();
    }

    // ---- internal actions ----

    function _release() internal nonReentrant {
        stage = Stage.RELEASED;
        emit StageChanged(stage);

        bool ok = token.transfer(beneficiary, amount);
        require(ok, "transfer failed");
        emit Released(amount);
    }

    function _refund() internal nonReentrant {
        stage = Stage.REFUNDED;
        emit StageChanged(stage);

        bool ok = token.transfer(depositor, amount);
        require(ok, "transfer failed");
        emit Refunded(amount);
    }

    // ---- views ----
    function balance() external view returns (uint256) {
        return token.balanceOf(address(this));
    }
}