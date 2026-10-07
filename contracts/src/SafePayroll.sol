// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ITombstone} from "./ITombstone.sol";

/**
 * @title SafePayroll
 * @notice Pays employees in an ERC20. If an employee's wallet is flagged by the TombstoneRegistry,
 *         the salary is ESCROWED (never confiscated). The employer can re-attest a new wallet; the
 *         escrow is released only once the registry reports the new wallet scanned-clean. The old
 *         compromised key can never redirect or release funds on its own.
 */
contract SafePayroll {
    using SafeERC20 for IERC20;

    struct Employee {
        address wallet;
        uint256 salary;
        bool active;
    }

    IERC20 public immutable token;
    ITombstone public immutable registry;
    address public immutable employer;

    Employee[] public employees;
    mapping(uint256 => uint256) public escrowed;
    mapping(uint256 => address) public pendingWallet;

    event Paid(uint256 indexed id, address indexed to, uint256 amount);
    event Escrowed(uint256 indexed id, address indexed flaggedWallet, uint256 amount);
    event Reattested(uint256 indexed id, address indexed oldWallet, address indexed newWallet);
    event Released(uint256 indexed id, address indexed to, uint256 amount);

    error NotEmployer();
    error WalletFlagged(address w);
    error NoPendingWallet();
    error NewWalletNotScannedClean(address w);
    error NotEmployee();

    modifier onlyEmployer() {
        if (msg.sender != employer) revert NotEmployer();
        _;
    }

    constructor(IERC20 _token, ITombstone _registry, address _employer) {
        token = _token;
        registry = _registry;
        employer = _employer;
    }

    function addEmployee(address wallet, uint256 salary) external onlyEmployer returns (uint256 id) {
        id = employees.length;
        employees.push(Employee({wallet: wallet, salary: salary, active: true}));
    }

    function changeOwnWallet(uint256 id, address newWallet) external {
        Employee storage e = employees[id];
        if (msg.sender != e.wallet) revert NotEmployee();
        if (registry.isFlagged(e.wallet)) revert WalletFlagged(e.wallet);
        if (registry.isFlagged(newWallet)) revert WalletFlagged(newWallet);
        e.wallet = newWallet;
    }

    function runPayroll() external onlyEmployer {
        uint256 n = employees.length;
        for (uint256 id = 0; id < n; id++) {
            Employee storage e = employees[id];
            if (!e.active) continue;
            token.safeTransferFrom(employer, address(this), e.salary);
            if (registry.isFlagged(e.wallet)) {
                escrowed[id] += e.salary;
                emit Escrowed(id, e.wallet, e.salary);
            } else {
                token.safeTransfer(e.wallet, e.salary);
                emit Paid(id, e.wallet, e.salary);
            }
        }
    }

    function reattest(uint256 id, address newWallet) external onlyEmployer {
        if (registry.isFlagged(newWallet)) revert WalletFlagged(newWallet);
        pendingWallet[id] = newWallet;
        emit Reattested(id, employees[id].wallet, newWallet);
    }

    function release(uint256 id) external {
        address to = pendingWallet[id];
        if (to == address(0)) revert NoPendingWallet();
        if (!registry.isScannedClean(to)) revert NewWalletNotScannedClean(to);
        uint256 amount = escrowed[id];
        escrowed[id] = 0;
        employees[id].wallet = to;
        pendingWallet[id] = address(0);
        token.safeTransfer(to, amount);
        emit Released(id, to, amount);
    }

    function employeeCount() external view returns (uint256) {
        return employees.length;
    }
}
