import fs from "fs";
import assert from "assert";
import ethersPkg from "ethers";

const { ethers } = ethersPkg;

const RPC = process.argv[2] || "http://127.0.0.1:8555";
const PK = process.env.PRIVATE_KEY || "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";

const provider = new ethers.providers.JsonRpcProvider(RPC);
const wallet = new ethers.Wallet(PK, provider);

function artifact(file, name = file) {
  return JSON.parse(fs.readFileSync(`../contracts/out/${file}.sol/${name}.json`, "utf8"));
}

function bytecode(artifactJson) {
  return artifactJson.bytecode.object.startsWith("0x")
    ? artifactJson.bytecode.object
    : `0x${artifactJson.bytecode.object}`;
}

async function deployContract(file, name = file) {
  const a = artifact(file, name);
  const factory = new ethers.ContractFactory(a.abi, bytecode(a), wallet);
  const contract = await factory.deploy();
  await contract.deployed();
  return { contract, abi: a.abi };
}

async function deployProxy(impl, abi, initName, args) {
  const proxyArt = artifact("ERC1967Proxy");
  const iface = new ethers.utils.Interface(abi);
  const initData = iface.encodeFunctionData(initName, args);
  const factory = new ethers.ContractFactory(proxyArt.abi, bytecode(proxyArt), wallet);
  const proxy = await factory.deploy(impl.address, initData);
  await proxy.deployed();
  return new ethers.Contract(proxy.address, abi, wallet);
}

async function send(txPromise) {
  const tx = await txPromise;
  return tx.wait();
}

function nums(arr) {
  return Array.from(arr).map((x) => Number(x));
}

function has(list, id) {
  return list.map((x) => x.toString()).includes(id.toString());
}

function activeHas(listings, cardId) {
  return listings.some((l) => l.cardId.toString() === cardId.toString() && l.active);
}

function errorText(error) {
  return String(
    error?.reason ||
    error?.error?.message ||
    error?.error?.error?.message ||
    error?.data?.message ||
    error?.message ||
    error
  );
}

async function expectRevert(label, action, expectedReason) {
  try {
    await action();
  } catch (error) {
    const text = errorText(error);
    assert(
      text.includes(expectedReason),
      `${label} reverted, but reason did not include "${expectedReason}": ${text}`
    );
    console.log(`PASS revert ${label}: ${expectedReason}`);
    return;
  }
  throw new Error(`${label} did not revert`);
}

function pass(message) {
  console.log(`PASS ${message}`);
}

async function main() {
  console.log(`E2E RPC ${RPC}`);
  console.log("Deploying implementations and proxies...");

  const registryImpl = await deployContract("AgentRegistry");
  const agentLedgerImpl = await deployContract("AgentLedger");
  const locationLedgerImpl = await deployContract("LocationLedger");
  const inboxLedgerImpl = await deployContract("InboxLedger");
  const evalLedgerImpl = await deployContract("EvaluationLedger");
  const gameImpl = await deployContract("GameEngine");
  const treasuryImpl = await deployContract("GTreasury");
  const cardsImpl = await deployContract("CardLedger");
  const arenaImpl = await deployContract("ArenaEngine");

  const operator = wallet.address;
  const registry = await deployProxy(registryImpl.contract, registryImpl.abi, "initialize", [operator]);
  const agentLedger = await deployProxy(agentLedgerImpl.contract, agentLedgerImpl.abi, "initialize", [registry.address]);
  const locationLedger = await deployProxy(locationLedgerImpl.contract, locationLedgerImpl.abi, "initialize", [registry.address]);
  await deployProxy(inboxLedgerImpl.contract, inboxLedgerImpl.abi, "initialize", [registry.address]);
  const evalLedger = await deployProxy(evalLedgerImpl.contract, evalLedgerImpl.abi, "initialize", [registry.address]);
  const game = await deployProxy(gameImpl.contract, gameImpl.abi, "initialize", [registry.address, locationLedger.address]);
  const treasury = await deployProxy(treasuryImpl.contract, treasuryImpl.abi, "initialize", [registry.address]);
  const cards = await deployProxy(cardsImpl.contract, cardsImpl.abi, "initialize", [registry.address, treasury.address]);

  await send(registry.addOperator(game.address));
  await send(registry.addOperator(cards.address));
  await send(game.setAgentLedger(agentLedger.address));
  await send(game.setEvaluationLedger(evalLedger.address));

  const arena = await deployProxy(arenaImpl.contract, arenaImpl.abi, "initialize", [
    registry.address,
    game.address,
    evalLedger.address,
    treasury.address,
    cards.address,
  ]);
  await send(registry.addOperator(arena.address));
  await send(cards.setArenaEngine(arena.address));

  const stats = [5, 5, 5, 5];
  async function createAgent(name) {
    const id = Number(await registry.nextAgentId());
    await send(game.createAgent(name, name, stats, operator));
    return id;
  }

  const seed = await createAgent("MarketSeed");
  await send(arena.bootstrapMarket(seed));
  await send(game.initWorldBible());
  pass(`部署完成，MarketSeed agent=${seed}`);

  let listings = await cards.getActiveListings(0, 20);
  assert.equal(listings.length, 7, "bootstrap should seed 7 listings");
  assert.equal(Number(await treasury.gBalance(seed)), 500, "seed G should be 500");
  pass("bootstrap market 有 7 个挂单，seed 有 500 G");

  const seller = await createAgent("Issue32Seller");
  const buyer = await createAgent("Issue32Buyer");
  const poor = await createAgent("Issue32Poor");
  await send(treasury.fundAgentG(seller, 500));
  await send(treasury.fundAgentG(buyer, 500));
  await send(treasury.fundAgentG(poor, 50));
  assert.equal(Number(await treasury.gBalance(seller)), 500);
  assert.equal(Number(await treasury.gBalance(buyer)), 500);
  assert.equal(Number(await treasury.gBalance(poor)), 50);
  pass(`创建 seller=${seller}, buyer=${buyer}, poor=${poor} 并 fund G`);

  const oreBefore = await game.orePool(seller);
  const gBefore = await treasury.gBalance(seller);
  const buyReceipt = await send(arena.buy(seller, 1));
  const cardBought = buyReceipt.logs
    .map((log) => {
      try { return arena.interface.parseLog(log); } catch { return null; }
    })
    .find((event) => event?.name === "CardBought");
  assert(cardBought, "CardBought event missing");
  const cardId = cardBought.args.cardId;
  assert.equal(Number(cardBought.args.unitType), 1);
  assert.equal(Number(await treasury.gBalance(seller)), Number(gBefore) - 3);
  assert.equal((await game.orePool(seller)).toString(), oreBefore.toString());
  let ghost = await arena.getGhost(seller);
  let ghostCards = await arena.getGhostCards(seller);
  assert.deepEqual(nums(ghost.bench), [0, 0, 0, 0, 0]);
  assert.deepEqual(nums(ghostCards), [0, 0, 0, 0, 0]);
  assert(has(await cards.getOwnedCards(seller), cardId));
  pass(`买卡只进背包：cardId=${cardId.toString()}, G 500->497, ore 不变，bench 为空`);

  await send(arena.placeCard(seller, cardId, 0));
  ghost = await arena.getGhost(seller);
  ghostCards = await arena.getGhostCards(seller);
  assert.equal(Number(ghost.bench[0]), 1);
  assert.equal(ghostCards[0].toString(), cardId.toString());
  assert.equal(await arena.isCardOnBench(seller, cardId), true);
  pass("背包卡可以上阵：bench[0]=1 且 cardIds[0]=cardId");

  await expectRevert("上阵卡不能挂市场", () => cards.callStatic.listCard(seller, cardId, 100), "card on bench");

  const gBeforeRemove = await treasury.gBalance(seller);
  await send(arena.removeCard(seller, 0));
  ghost = await arena.getGhost(seller);
  ghostCards = await arena.getGhostCards(seller);
  assert.equal((await treasury.gBalance(seller)).toString(), gBeforeRemove.toString());
  assert.equal(Number(ghost.bench[0]), 0);
  assert.equal(Number(ghostCards[0]), 0);
  assert.equal(await arena.isCardOnBench(seller, cardId), false);
  assert(has(await cards.getOwnedCards(seller), cardId));
  pass("从阵容取下不退款：G 不变，bench/cardIds 清空，卡仍在背包");

  await send(cards.listCard(seller, cardId, 100));
  listings = await cards.getActiveListings(0, 20);
  assert(activeHas(listings, cardId), "listing should exist after list");
  await send(cards.cancelListing(seller, cardId));
  listings = await cards.getActiveListings(0, 20);
  assert(!activeHas(listings, cardId), "listing should disappear after cancel");
  assert(has(await cards.getOwnedCards(seller), cardId), "seller should still own card after cancel");
  await send(cards.listCard(seller, cardId, 100));
  listings = await cards.getActiveListings(0, 20);
  assert(activeHas(listings, cardId), "listing should exist after relist");
  pass("背包卡可挂市场、取消、重新挂，取消不改变 owner/G");

  await expectRevert("maxPrice 低于 ask", () => cards.callStatic.buyListed(buyer, cardId, 99), "price too high");
  await expectRevert("余额不足买市场卡", () => cards.callStatic.buyListed(poor, cardId, 100), "insufficient G");
  await expectRevert("卖家不能自买", () => cards.callStatic.buyListed(seller, cardId, 100), "self buy");

  const sellerGBeforeSale = await treasury.gBalance(seller);
  const buyerGBeforeSale = await treasury.gBalance(buyer);
  await send(cards.buyListed(buyer, cardId, 100));
  assert.equal(Number(await treasury.gBalance(seller)), Number(sellerGBeforeSale) + 100);
  assert.equal(Number(await treasury.gBalance(buyer)), Number(buyerGBeforeSale) - 100);
  assert.equal((await cards.getCard(cardId)).ownerAgent.toString(), buyer.toString());
  assert(!has(await cards.getOwnedCards(seller), cardId));
  assert(has(await cards.getOwnedCards(buyer), cardId));
  listings = await cards.getActiveListings(0, 20);
  assert(!activeHas(listings, cardId), "listing should close after buy");
  pass("市场成交：buyer 扣 100 G，seller 收 100 G，card owner 转给 buyer");

  await send(arena.placeCard(buyer, cardId, 2));
  ghost = await arena.getGhost(buyer);
  ghostCards = await arena.getGhostCards(buyer);
  assert.equal(Number(ghost.bench[2]), 1);
  assert.equal(ghostCards[2].toString(), cardId.toString());
  pass("市场买来的卡可以上阵：buyer bench[2]=1 且 cardIds[2]=cardId");

  const listedCardReceipt = await send(arena.buy(seller, 2));
  const listedCard = listedCardReceipt.logs
    .map((log) => {
      try { return arena.interface.parseLog(log); } catch { return null; }
    })
    .find((event) => event?.name === "CardBought");
  const listedCardId = listedCard.args.cardId;
  await send(cards.listCard(seller, listedCardId, 77));
  await expectRevert("已挂市场的卡不能上阵", () => arena.callStatic.placeCard(seller, listedCardId, 1), "card listed");

  for (const [unit, slot] of [[1, 0], [2, 1], [3, 3], [4, 4]]) {
    const receipt = await send(arena.buy(buyer, unit));
    const event = receipt.logs
      .map((log) => {
        try { return arena.interface.parseLog(log); } catch { return null; }
      })
      .find((item) => item?.name === "CardBought");
    await send(arena.placeCard(buyer, event.args.cardId, slot));
  }
  ghost = await arena.getGhost(buyer);
  assert.deepEqual(nums(ghost.bench).map((unit) => unit > 0), [true, true, true, true, true]);
  const extraReceipt = await send(arena.buy(buyer, 10));
  const extraCard = extraReceipt.logs
    .map((log) => {
      try { return arena.interface.parseLog(log); } catch { return null; }
    })
    .find((event) => event?.name === "CardBought");
  assert(has(await cards.getOwnedCards(buyer), extraCard.args.cardId));
  ghost = await arena.getGhost(buyer);
  assert.deepEqual(nums(ghost.bench).map((unit) => unit > 0), [true, true, true, true, true]);
  pass("阵容满了仍可继续买卡进背包，bench 不被改动");

  await expectRevert("bootstrapMarket one-shot", () => arena.callStatic.bootstrapMarket(seed), "already seeded");

  console.log("E2E PASS: buy->inventory->bench->inventory->market->buyer inventory->buyer bench 全链路通过");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
