const express = require("express");

const router = express.Router();

router.all("/", (_req, res) => {
  res.status(501).json({
    error: "superAdmin route is not implemented yet",
  });
});

module.exports = router;
